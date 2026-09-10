// A baseline day for the change-attribution surface, on the dev database only.
//
// WHY THIS EXISTS. `/accounts/change-attribution` needs a snapshot dated
// strictly before today on every measurable account. The dev branch holds
// exactly one day of history (23 rows, all dated 2026-09-07, written lazily
// by the app's own reads), so the honest live answer is "not enough history"
// — which is a state worth screenshotting, but it is not the only one.
//
// This writes ONE backdated day so the fired state can be seen, and prints
// exactly what it wrote. Nothing here runs in the product and nothing here
// reaches a user: it is a fixture for a screenshot, in the same spirit as the
// response rewrites in insight-shot.ts, except that those cannot be used here
// — rewriting the endpoint's own response would be screenshotting a fiction
// instead of the pipeline.
//
// WHAT IS REAL AND WHAT IS NOT, precisely:
//   REAL   the balances now, the 46 ledger rows, the rate now, and every
//          figure the surface prints — each one is computed by the real
//          server code from the inputs below.
//   FIXED  the baseline balance is reconstructed as
//            balanceNow − (signed ledger effect since the baseline capture)
//          which is the balance the ledger says the account held on that day,
//          plus a STATED perturbation on two accounts so that the
//          `unexplained` and `valuation` parts are non-zero and can be seen.
//   FIXED  the baseline rates. There is no historical FX store in this repo,
//          and re-using today's rate would make the rate share zero by
//          construction — the exact failure change-attribution.ts refuses to
//          commit. They are stated constants, printed on write.
//
// Usage:
//   tsx scripts/src/attribution-fixture.ts --write
//   tsx scripts/src/attribution-fixture.ts --clear     (removes only BASELINE_DATE)

import { db, accountsTable, accountBalanceSnapshotsTable, transactionsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const BASELINE_DATE = "2026-08-08";
const BASELINE_CAPTURED = new Date("2026-08-08T06:00:00Z");

// Stated, not observed. Printed on every write so a screenshot can be traced
// back to the number that produced it.
const BASELINE_RATES: Record<string, number> = { GBP: 1, EUR: 0.84, MYR: 0.19 };

// Stated perturbations, in NATIVE units, applied on top of the ledger
// reconstruction. Without them the ledger explains the whole move and two of
// the four parts are correctly absent.
const PERTURB: Record<string, number> = {
  "Monzo Current": 40,          // a balance that moved with no transaction
  "Flat, Kuala Lumpur": 8000,   // a revaluation, in MYR
};

// Deliberately identical to signedEffect in api-server/src/lib/reconciliation.ts,
// including the part that is easy to get wrong: a legacy transfer with no
// direction is a NO-OP, because adjustAccountBalance never applied one. A
// fixture that used -amount there wrote a baseline the ledger disagrees with,
// and the surface then correctly reported the difference as unexplained —
// an artefact of the script showing up as a finding about the data.
function signedEffect(t: { type: string; nativeAmount: string; transferDirection: string | null }): number {
  const amount = parseFloat(t.nativeAmount);
  if (t.type === "income") return amount;
  if (t.type === "expense") return -amount;
  if (t.type === "transfer") {
    if (t.transferDirection === "out") return -amount;
    if (t.transferDirection === "in") return amount;
  }
  return 0;
}

const mode = process.argv[2];
if (mode !== "--write" && mode !== "--clear") {
  console.error("usage: attribution-fixture.ts --write | --clear");
  process.exit(1);
}

const existing = await db.select().from(accountBalanceSnapshotsTable);
const atBaseline = existing.filter((s) => s.date === BASELINE_DATE);

if (mode === "--clear") {
  for (const row of atBaseline) {
    await db.delete(accountBalanceSnapshotsTable).where(eq(accountBalanceSnapshotsTable.id, row.id));
  }
  console.log(`cleared ${atBaseline.length} row(s) dated ${BASELINE_DATE}`);
  process.exit(0);
}

if (atBaseline.length > 0) {
  console.log(`${atBaseline.length} row(s) already dated ${BASELINE_DATE} — clear first`);
  process.exit(1);
}

const accounts = await db.select().from(accountsTable);
const txs = await db.select().from(transactionsTable);
// The LATEST snapshot per account, not every snapshot after the baseline.
// This read `existing.filter((s) => s.date > BASELINE_DATE)` and worked only
// while the dev branch held exactly one day of history. Once it held five
// (2026-09-07..11) the loop below tried to write five baseline rows per
// account and died on account_balance_snapshots_account_date_uniq, which
// made the fired state uncapturable — found 2026-09-11 while capturing the
// allocation surface's populated state.
const latestPerAccount = new Map<number, typeof existing[number]>();
for (const s of existing) {
  if (s.date <= BASELINE_DATE) continue;
  const held = latestPerAccount.get(s.accountId);
  if (held == null || s.date > held.date) latestPerAccount.set(s.accountId, s);
}
const today = [...latestPerAccount.values()];

console.log(`baseline rates (stated): ${JSON.stringify(BASELINE_RATES)}`);
let written = 0;
for (const snap of today) {
  const account = accounts.find((a) => a.id === snap.accountId);
  if (account == null) continue;
  const rate = BASELINE_RATES[account.currency];
  if (rate == null) { console.log(`  skip ${account.name} — no stated rate for ${account.currency}`); continue; }

  const ledger = txs
    .filter((t) => t.accountId === account.id && t.createdAt > BASELINE_CAPTURED)
    .reduce((sum, t) => sum + signedEffect(t), 0);
  const perturb = PERTURB[account.name] ?? 0;
  const balance = parseFloat(snap.balance) - ledger - perturb;

  await db.insert(accountBalanceSnapshotsTable).values({
    userId: snap.userId,
    accountId: account.id,
    date: BASELINE_DATE,
    balance: balance.toFixed(4),
    currency: account.currency,
    nativeToBaseRate: rate.toFixed(8),
    rateAsOf: BASELINE_CAPTURED,
    capturedAt: BASELINE_CAPTURED,
  });
  written += 1;
  if (ledger !== 0 || perturb !== 0) {
    console.log(`  ${account.name} (${account.currency}): ${balance.toFixed(2)} = ${parseFloat(snap.balance).toFixed(2)} − ledger ${ledger.toFixed(2)} − perturb ${perturb.toFixed(2)}`);
  }
}
console.log(`wrote ${written} row(s) dated ${BASELINE_DATE}`);
process.exit(0);
