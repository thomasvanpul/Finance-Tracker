// Backfill historical FX rates onto pre-Aug-30 transactions.
//
// Every row where native_to_base_rate IS NULL has its rate looked up
// from Frankfurter historical (https://api.frankfurter.dev/{date}?from=X&to=Y)
// and stored. The lookup uses each row's OWN date, so the rate
// reflects the day the transaction actually happened — the whole
// point of "last August is what last August was."
//
// Idempotent: only touches null-rate rows. Safe to re-run against
// the same DB — new null-rate rows created after a previous run will
// be picked up on the next pass.
//
// Dry-run by default. Pass --apply to actually write. Prints a plan
// on stdout including row count, unique (date, from, to) pairs it
// will query, and which rows it expects to leave null.
//
// Guards:
//   • Refuses to run without a --branch=dev or --branch=prod flag.
//     Fails loud if DATABASE_URL doesn't match the declared branch.
//   • Prints the branch it's about to touch and requires a 3-second
//     confirmation window when --apply and --branch=prod are both set.
//
// Usage:
//   pnpm --filter @workspace/scripts run backfill:dev             # dry-run
//   pnpm --filter @workspace/scripts run backfill:dev -- --apply  # write
//   pnpm --filter @workspace/scripts run backfill:prod -- --apply # write, with confirm
//
// Frankfurter:
//   - Free, unauthenticated, ECB reference rates (daily fixing).
//   - Coverage: ~30 currencies including GBP/USD/EUR/JPY/MYR/CNY/
//     SGD/AUD/CAD/INR/THB/HKD. All currencies in market.ts FX_PAIRS
//     are covered.
//   - Weekend / holiday dates: server transparently returns the
//     previous business day's rate. body.date tells you the actual
//     date used; we log the mismatch when it happens.
//   - No published rate limit; 100ms polite pace is enough.

import { and, eq, isNull, sql } from "drizzle-orm";
import { db, transactionsTable, appSettingsTable, userTable } from "@workspace/db";

// Frankfurter's live currency list. Any (from, to) pair where BOTH
// endpoints are in this set is fillable; a row with a currency
// outside it will stay null after the backfill and needs another
// path (or be accepted as read-path-fallback-forever). Kept literal
// so the plan output can name specific unfillable rows rather than
// just count them. Source: https://api.frankfurter.dev/v1/currencies
// (30 Aug 2026 snapshot, ECB reference set).
const FRANKFURTER_CURRENCIES = new Set([
  "AUD", "BGN", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR",
  "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY", "KRW",
  "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD",
  "THB", "TRY", "USD", "ZAR",
]);

// ── Branch guard ────────────────────────────────────────────────────
const DEV_DB_HOST = "ep-withered-night-abucoq17";
// Prod host from lib/db/.env.production.backup. Kept as a positive
// assertion so a misconfigured .env doesn't silently touch prod.
const PROD_DB_HOST = "ep-dark-hall-ab7g28of";

function parseArgs(): { branch: "dev" | "prod"; apply: boolean } {
  const args = process.argv.slice(2);
  const branchFlag = args.find((a) => a.startsWith("--branch="));
  const branch = branchFlag?.split("=")[1] as "dev" | "prod" | undefined;
  if (branch !== "dev" && branch !== "prod") {
    console.error("Usage: backfill-tx-rates --branch=dev|prod [--apply]");
    process.exit(1);
  }
  return { branch, apply: args.includes("--apply") };
}

function assertBranch(branch: "dev" | "prod"): void {
  const url = process.env.DATABASE_URL ?? "";
  const expectedHost = branch === "dev" ? DEV_DB_HOST : PROD_DB_HOST;
  if (!url.includes(expectedHost)) {
    console.error(
      `[backfill] refusing to run — --branch=${branch} declared, ` +
        `DATABASE_URL must contain host "${expectedHost}"`,
    );
    console.error(
      `[backfill] observed: ${url ? url.replace(/:[^@/]+@/, ":***@") : "(unset)"}`,
    );
    process.exit(1);
  }
}

async function confirmProd(): Promise<void> {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  About to WRITE to PRODUCTION.                           ║");
  console.log("║  This will UPDATE native_to_base_rate + rate_as_of on    ║");
  console.log("║  every null-rate transaction row in prod.                ║");
  console.log("║  Sleeping 3s. Ctrl-C to abort.                            ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  await new Promise((r) => setTimeout(r, 3000));
}

// ── Frankfurter client ─────────────────────────────────────────────
interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;     // may differ from requested date on weekends/holidays
  rates: Record<string, number>;
}

async function fetchFrankfurter(
  date: string,
  from: string,
  to: string,
): Promise<{ rate: number; effectiveDate: string } | null> {
  const url = `https://api.frankfurter.dev/v1/${date}?base=${from}&symbols=${to}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    console.warn(`[backfill] frankfurter ${date} ${from}->${to}: HTTP ${res.status}`);
    return null;
  }
  const body = (await res.json()) as FrankfurterResponse;
  const rate = body.rates?.[to];
  if (typeof rate !== "number" || rate <= 0) return null;
  return { rate, effectiveDate: body.date };
}

// ── Backfill core ──────────────────────────────────────────────────
interface NullRateRow {
  id: number;
  userId: string;
  date: string;
  currency: string;
}

async function loadNullRateRows(): Promise<NullRateRow[]> {
  const rows = await db
    .select({
      id: transactionsTable.id,
      userId: transactionsTable.userId,
      date: transactionsTable.date,
      currency: transactionsTable.currency,
    })
    .from(transactionsTable)
    .where(and(isNull(transactionsTable.nativeToBaseRate), sql`${transactionsTable.userId} IS NOT NULL`));
  return rows.map((r) => ({ ...r, userId: r.userId! }));
}

async function loadBaseCurrencyMap(userIds: Set<string>): Promise<Map<string, string>> {
  if (userIds.size === 0) return new Map();
  const rows = await db
    .select({ userId: appSettingsTable.userId, baseCurrency: appSettingsTable.baseCurrency })
    .from(appSettingsTable);
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.userId != null && userIds.has(r.userId)) map.set(r.userId, r.baseCurrency);
  }
  // Users without an app_settings row default to GBP (mirrors
  // getBaseCurrency's ensureSettings behaviour). Materialise the
  // default so downstream code doesn't have to null-check.
  for (const uid of userIds) if (!map.has(uid)) map.set(uid, "GBP");
  return map;
}

// Emails for plan-output readability. Kept small — we only look up
// users that appear in the null-rate row set, not the whole user
// table.
async function loadUserEmailMap(userIds: Set<string>): Promise<Map<string, string>> {
  if (userIds.size === 0) return new Map();
  const rows = await db
    .select({ id: userTable.id, email: userTable.email })
    .from(userTable);
  const map = new Map<string, string>();
  for (const r of rows) if (userIds.has(r.id)) map.set(r.id, r.email ?? "(no email)");
  return map;
}

interface UserBreakdown {
  userId: string;
  email: string;
  baseCurrency: string;
  totalRows: number;
  sameCurrencyRows: number;
  frankfurterFillRows: number;
  unfillableRows: number;
  unfillableReasons: Map<string, number>;   // currency → count
}

interface Plan {
  totalRows: number;
  rowsSameCurrency: number;
  rowsNeedingFetch: number;
  rowsMissingBase: number;
  rowsUnfillable: number;
  uniquePairs: Array<{ date: string; from: string; to: string; rowCount: number }>;
  users: UserBreakdown[];
  currenciesEncountered: Set<string>;
  unfillableCurrencies: Set<string>;
}

async function buildPlan(): Promise<Plan> {
  const rows = await loadNullRateRows();
  const userIds = new Set(rows.map((r) => r.userId));
  const [baseByUser, emailByUser] = await Promise.all([
    loadBaseCurrencyMap(userIds),
    loadUserEmailMap(userIds),
  ]);

  const perUser = new Map<string, UserBreakdown>();
  const currenciesEncountered = new Set<string>();
  const unfillableCurrencies = new Set<string>();
  const pairCounts = new Map<string, { date: string; from: string; to: string; rowCount: number }>();
  let rowsSameCurrency = 0;
  let rowsMissingBase = 0;
  let rowsUnfillable = 0;

  for (const r of rows) {
    currenciesEncountered.add(r.currency);
    const base = baseByUser.get(r.userId) ?? null;

    let u = perUser.get(r.userId);
    if (!u) {
      u = {
        userId: r.userId,
        email: emailByUser.get(r.userId) ?? "(unknown)",
        baseCurrency: base ?? "(none)",
        totalRows: 0,
        sameCurrencyRows: 0,
        frankfurterFillRows: 0,
        unfillableRows: 0,
        unfillableReasons: new Map(),
      };
      perUser.set(r.userId, u);
    }
    u.totalRows += 1;

    if (!base) { rowsMissingBase += 1; u.unfillableRows += 1; continue; }
    if (r.currency === base) { rowsSameCurrency += 1; u.sameCurrencyRows += 1; continue; }

    // Frankfurter coverage check: both endpoints must be in the ECB
    // set. Anything else stays null (read-path fallback continues to
    // work for it, but the row won't be locked to a stored rate).
    if (!FRANKFURTER_CURRENCIES.has(r.currency) || !FRANKFURTER_CURRENCIES.has(base)) {
      rowsUnfillable += 1;
      u.unfillableRows += 1;
      unfillableCurrencies.add(r.currency);
      const reason = FRANKFURTER_CURRENCIES.has(r.currency)
        ? `base ${base} not in Frankfurter set`
        : `${r.currency} not in Frankfurter set`;
      u.unfillableReasons.set(reason, (u.unfillableReasons.get(reason) ?? 0) + 1);
      continue;
    }

    u.frankfurterFillRows += 1;
    const key = `${r.date}|${r.currency}|${base}`;
    const existing = pairCounts.get(key);
    if (existing) existing.rowCount += 1;
    else pairCounts.set(key, { date: r.date, from: r.currency, to: base, rowCount: 1 });
  }

  return {
    totalRows: rows.length,
    rowsSameCurrency,
    rowsNeedingFetch: pairCounts.size === 0
      ? 0
      : rows.length - rowsSameCurrency - rowsMissingBase - rowsUnfillable,
    rowsMissingBase,
    rowsUnfillable,
    uniquePairs: [...pairCounts.values()].sort((a, b) =>
      a.date.localeCompare(b.date) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
    ),
    users: [...perUser.values()].sort((a, b) => b.totalRows - a.totalRows),
    currenciesEncountered,
    unfillableCurrencies,
  };
}

function printPlan(plan: Plan): void {
  console.log("");
  console.log("== BACKFILL PLAN ==");
  console.log(`  Total null-rate rows:        ${plan.totalRows}`);
  console.log(`  Same-currency (rate = 1):    ${plan.rowsSameCurrency}   (no HTTP)`);
  console.log(`  Needing Frankfurter fetch:   ${plan.rowsNeedingFetch}`);
  console.log(`  Missing base (skipped):      ${plan.rowsMissingBase}`);
  console.log(`  Unfillable — stay null:      ${plan.rowsUnfillable}`);
  if (plan.unfillableCurrencies.size > 0) {
    console.log(`    (currencies outside Frankfurter: ${[...plan.unfillableCurrencies].sort().join(", ")})`);
  }
  console.log(`  Unique (date,from,to) pairs: ${plan.uniquePairs.length}`);
  console.log(`  Currencies encountered:      ${[...plan.currenciesEncountered].sort().join(", ")}`);
  console.log("");

  console.log(`── PER-USER BREAKDOWN (${plan.users.length} users) ──`);
  for (const u of plan.users) {
    console.log(`  ${u.email}   (base: ${u.baseCurrency})`);
    console.log(`    total null-rate rows:   ${u.totalRows}`);
    console.log(`      same-currency (rate=1): ${u.sameCurrencyRows}`);
    console.log(`      Frankfurter fills:      ${u.frankfurterFillRows}`);
    if (u.unfillableRows > 0) {
      console.log(`      unfillable:             ${u.unfillableRows}`);
      for (const [reason, count] of u.unfillableReasons.entries()) {
        console.log(`        - ${reason}: ${count}`);
      }
    }
  }
  console.log("");

  console.log(`── UNIQUE (date, from, to) TUPLES TO QUERY (${plan.uniquePairs.length}) ──`);
  for (const p of plan.uniquePairs) {
    console.log(`  ${p.date}  ${p.from} → ${p.to}   (${p.rowCount} row${p.rowCount === 1 ? "" : "s"})`);
  }
  console.log("");

  // Legacy tail — kept for the earlier compact-output consumers.
  if (plan.users.length <= 10) {
    console.log(`  Rows per user (short form):`);
    for (const u of plan.users) {
      console.log(`    ${u.userId.slice(0, 8)}...  ${u.totalRows}`);
    }
  }
  console.log("");
  console.log(`  Estimated wall time: ${Math.max(1, Math.ceil(plan.uniquePairs.length * 0.15))}s`);
  console.log("     (100ms pace between HTTP calls plus request round-trip)");
}

async function apply(plan: Plan): Promise<void> {
  const rows = await loadNullRateRows();
  const baseByUser = await loadBaseCurrencyMap(new Set(rows.map((r) => r.userId)));

  // Cache Frankfurter results per (date, from, to) so a run of
  // multiple rows on the same day+currency hits the network once.
  const rateCache = new Map<string, { rate: number; effectiveDate: string } | null>();

  let updated = 0;
  let stayedNull = 0;
  let sameCurrency = 0;
  let dateMismatches = 0;
  let httpCalls = 0;

  for (const r of rows) {
    const base = baseByUser.get(r.userId);
    if (!base) { stayedNull += 1; continue; }

    let rate: number;
    let rateAsOfDate: string;

    if (r.currency === base) {
      rate = 1;
      rateAsOfDate = r.date;
      sameCurrency += 1;
    } else {
      // Skip pairs Frankfurter doesn't cover — no point burning HTTP
      // on a call we know will 404. Row stays null; read-path
      // fallback via live toBase() handles it.
      if (!FRANKFURTER_CURRENCIES.has(r.currency) || !FRANKFURTER_CURRENCIES.has(base)) {
        stayedNull += 1;
        continue;
      }
      const key = `${r.date}|${r.currency}|${base}`;
      let cached = rateCache.get(key);
      if (cached === undefined) {
        cached = await fetchFrankfurter(r.date, r.currency, base);
        rateCache.set(key, cached);
        httpCalls += 1;
        await new Promise((res) => setTimeout(res, 100));
      }
      if (cached == null) { stayedNull += 1; continue; }
      rate = cached.rate;
      rateAsOfDate = cached.effectiveDate;
      if (cached.effectiveDate !== r.date) dateMismatches += 1;
    }

    // rateAsOf at noon UTC on the effective date — matches how the
    // no-source-column comment in schema/transactions.ts distinguishes
    // backfilled rows (near-tx-date at noon) from live snapshots
    // (matching FX cache updatedAt within seconds).
    const rateAsOf = new Date(`${rateAsOfDate}T12:00:00.000Z`);

    await db
      .update(transactionsTable)
      .set({ nativeToBaseRate: String(rate), rateAsOf })
      .where(eq(transactionsTable.id, r.id));
    updated += 1;

    if (updated % 100 === 0) {
      console.log(`  ...${updated} updated, ${httpCalls} HTTP calls, ${stayedNull} stayed null`);
    }
  }

  console.log("");
  console.log("== BACKFILL COMPLETE ==");
  console.log(`  Rows updated:              ${updated}`);
  console.log(`    Same-currency (rate=1):  ${sameCurrency}`);
  console.log(`    Frankfurter fills:       ${updated - sameCurrency}`);
  console.log(`  Rows stayed null:          ${stayedNull}`);
  console.log(`  Frankfurter HTTP calls:    ${httpCalls}`);
  console.log(`  Date mismatches (weekend): ${dateMismatches}`);
}

async function main(): Promise<void> {
  const { branch, apply: shouldApply } = parseArgs();
  assertBranch(branch);
  console.log(`[backfill] connected to ${branch} branch`);

  const plan = await buildPlan();
  printPlan(plan);

  if (!shouldApply) {
    console.log("");
    console.log("Dry-run only. Pass --apply to write.");
    return;
  }

  if (branch === "prod") await confirmProd();
  await apply(plan);
}

main().catch((err) => {
  console.error("[backfill] failed:", err);
  process.exit(1);
});
