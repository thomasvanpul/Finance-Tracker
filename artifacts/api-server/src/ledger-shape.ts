// Measures the SHAPE of a transaction ledger. Read-only by DATABASE
// enforcement: every query runs inside `BEGIN TRANSACTION READ ONLY`,
// so Postgres itself rejects any write with SQLSTATE 25006, and the
// transaction is rolled back rather than committed. That is a
// guarantee from the server, not a convention this file follows.
//
// Written for the .review task "Measure the real ledger, and fix the
// normaliser that loses the licence" (2026-09-19). It prints counts,
// spans and distributions. It never dumps the ledger.
//
// It lives in api-server/src rather than scripts/src because it must
// import the REAL normaliser and the REAL detector — a copy of either
// would drift and would measure the wrong thing — and scripts/ sets
// rootDir: src, which forbids reaching across the package boundary.
// build.mjs bundles only src/index.ts, so this file ships nowhere.
//
// Merchant naming rule: a descriptor is NAMED in the output only when
// one of the normaliser's RULES matched it, which means it is a
// recognised company. Anything unmatched might be a person and is
// redacted to <unmatched #N>, with its shape — count, cadence, amount
// spread — still reported.
//
// Run it (tsx is owned by the scripts package):
//
//   cd scripts
//   pnpm exec tsx --env-file-if-exists=../lib/db/.env.production.backup \
//     ../artifacts/api-server/src/ledger-shape.ts --branch=prod
//
// For the dev branch, swap the env file for ../lib/db/.env and pass
// --branch=dev. The branch flag is checked against the DATABASE_URL
// host, so a mismatch refuses to run rather than reading the wrong DB.

import { pool } from "@workspace/db";
import { DEV_DB_HOST, PROD_DB_HOST } from "@workspace/db/hosts";
import { normalizeMerchant } from "./lib/merchant-normalizer";
import { detectRecurringPatterns } from "./lib/recurring-detector-server";

function parseArgs(): { branch: "dev" | "prod" } {
  const flag = process.argv.slice(2).find((a) => a.startsWith("--branch="));
  const branch = flag?.split("=")[1] as "dev" | "prod" | undefined;
  if (branch !== "dev" && branch !== "prod") {
    console.error("Usage: ledger-shape --branch=dev|prod");
    process.exit(1);
  }
  return { branch };
}

function assertBranch(branch: "dev" | "prod"): void {
  const url = process.env.DATABASE_URL ?? "";
  const expected = branch === "dev" ? DEV_DB_HOST : PROD_DB_HOST;
  if (!url.includes(expected)) {
    console.error(`[shape] refusing to run - --branch=${branch} but DATABASE_URL host isn't "${expected}"`);
    console.error(`[shape] observed: ${url ? url.replace(/:[^@/]+@/, ":***@") : "(unset)"}`);
    process.exit(1);
  }
}

// Mirrors merchant-normalizer.ts's no-rule-matched fallback. When
// normalizeMerchant returns exactly this, no RULE fired, so the
// descriptor is not a recognised company and must not be named.
function fallbackTrim(raw: string): string {
  return raw.replace(/\s*\*[A-Z0-9]{4,}\s*$/i, "").replace(/\s{2,}/g, " ").trim();
}

const unmatchedIds = new Map<string, number>();
function safeName(key: string): string {
  if (normalizeMerchant(key) !== fallbackTrim(key)) return key;
  if (!unmatchedIds.has(key)) unmatchedIds.set(key, unmatchedIds.size + 1);
  return `<unmatched #${unmatchedIds.get(key)}>`;
}

interface Row {
  date: string;
  description: string;
  nativeAmount: string;
  currency: string;
  type: string;
  source: string;
  user_id: string;
  account_id: number;
}

function histogram(counts: number[]): string {
  const b: Record<string, number> = { "1": 0, "2": 0, "3-5": 0, "6-11": 0, "12-23": 0, "24+": 0 };
  for (const n of counts) {
    if (n === 1) b["1"]++;
    else if (n === 2) b["2"]++;
    else if (n <= 5) b["3-5"]++;
    else if (n <= 11) b["6-11"]++;
    else if (n <= 23) b["12-23"]++;
    else b["24+"]++;
  }
  return Object.entries(b).map(([k, v]) => `${k}:${v}`).join("  ");
}

function cadence(days: number): string {
  if (days <= 9) return "weekly";
  if (days <= 17) return "fortnightly";
  if (days <= 45) return "monthly";
  if (days <= 75) return "bi-monthly";
  if (days <= 135) return "quarterly";
  if (days <= 225) return "half-yearly";
  if (days <= 400) return "ANNUAL";
  return `${days}d`;
}

function spanYears(d0: string, d1: string): string {
  return ((new Date(d1).getTime() - new Date(d0).getTime()) / 86400000 / 365.25).toFixed(2);
}

async function main(): Promise<void> {
  const { branch } = parseArgs();
  assertBranch(branch);

  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    console.log(`[shape] connected to ${branch}; transaction is READ ONLY (Postgres-enforced)\n`);

    // -- 1. Whole-ledger totals -----------------------------------------
    const totals = (await client.query(`
      select count(*)::int n, min(date)::text d0, max(date)::text d1,
             count(distinct account_id)::int accounts,
             count(distinct user_id)::int users,
             count(distinct description)::int descriptors
      from transactions`)).rows[0];

    if (!totals || totals.n === 0) {
      console.log("== 1. LEDGER TOTALS ==\n(no transactions)");
      await client.query("ROLLBACK");
      return;
    }

    const spanDays = Math.round(
      (new Date(totals.d1).getTime() - new Date(totals.d0).getTime()) / 86400000,
    );

    console.log("== 1. LEDGER TOTALS ==");
    console.log(`transactions                      ${totals.n}`);
    console.log(`span                              ${totals.d0} -> ${totals.d1}`);
    console.log(`                                  ${spanDays} days / ${(spanDays / 30.44).toFixed(1)} months / ${(spanDays / 365.25).toFixed(2)} years`);
    console.log(`accounts                          ${totals.accounts}`);
    console.log(`users                             ${totals.users}`);
    console.log(`distinct descriptors (as stored)  ${totals.descriptors}\n`);

    // -- 2. Ingest paths -------------------------------------------------
    const bySource = (await client.query(`
      select source, count(*)::int n, min(date)::text d0, max(date)::text d1,
             count(distinct description)::int descs
      from transactions group by source order by n desc`)).rows;

    console.log("== 2. INGEST PATHS (source column) ==");
    console.log("only source='csv' is normalised today; every other path stores the raw descriptor");
    for (const s of bySource) {
      console.log(`${String(s.source).padEnd(16)} ${String(s.n).padStart(6)} rows   ${s.d0} -> ${s.d1}   ${String(s.descs).padStart(5)} distinct descriptors`);
    }
    console.log();

    // -- 3. Per-user sizing ----------------------------------------------
    const byUser = (await client.query(`
      select user_id, count(*)::int n, min(date)::text d0, max(date)::text d1
      from transactions where user_id is not null
      group by user_id order by n desc`)).rows;

    console.log("== 3. USERS (multi-tenant; ids deliberately not printed) ==");
    byUser.forEach((u: { n: number; d0: string; d1: string }, i: number) => {
      console.log(`user ${i + 1}: ${String(u.n).padStart(6)} rows   ${u.d0} -> ${u.d1}  (${spanYears(u.d0, u.d1)} yr)`);
    });
    if (byUser.length === 0) {
      console.log("(no rows carry a user_id)");
      await client.query("ROLLBACK");
      return;
    }
    const target = byUser[0].user_id;
    console.log(`\n-> user 1 has the largest ledger; everything below is user 1 only\n`);

    // -- 4. Descriptor cardinality ---------------------------------------
    const rows: Row[] = (await client.query(
      `select date::text, description, native_amount as "nativeAmount", currency,
              type, source, user_id, account_id
       from transactions where user_id = $1 order by date`, [target])).rows;

    const storedCounts = new Map<string, number>();
    const normCounts = new Map<string, number>();
    for (const r of rows) {
      storedCounts.set(r.description, (storedCounts.get(r.description) ?? 0) + 1);
      const k = normalizeMerchant(r.description);
      normCounts.set(k, (normCounts.get(k) ?? 0) + 1);
    }
    const matched = [...storedCounts.keys()].filter((k) => normalizeMerchant(k) !== fallbackTrim(k)).length;
    const denom = Math.max(1, storedCounts.size);

    console.log("== 4. DESCRIPTOR CARDINALITY (user 1) ==");
    console.log(`rows                                    ${rows.length}`);
    console.log(`distinct descriptors as stored          ${storedCounts.size}`);
    console.log(`  ...a normaliser RULE matches          ${matched}  (${((matched / denom) * 100).toFixed(1)}% - a recognised company)`);
    console.log(`  ...unmatched, pass through verbatim   ${storedCounts.size - matched}`);
    console.log(`distinct keys AFTER normalisation       ${normCounts.size}   (collapse ${storedCounts.size} -> ${normCounts.size})`);
    console.log(`group sizes, as stored                  ${histogram([...storedCounts.values()])}`);
    console.log(`group sizes, normalised                 ${histogram([...normCounts.values()])}\n`);

    // -- 5. Detector ------------------------------------------------------
    const expenses = rows.filter((r) => r.type === "expense");
    const asStored = detectRecurringPatterns(expenses);
    const normalised = detectRecurringPatterns(
      expenses.map((r) => ({ ...r, description: normalizeMerchant(r.description) })),
    );

    console.log("== 5. DETECTOR OUTPUT ==");
    console.log(`expense rows                     ${expenses.length}`);
    console.log(`patterns, descriptions as stored ${asStored.length}   (what the app does today)`);
    console.log(`patterns, normalised everywhere  ${normalised.length}   (normaliser on all ingest paths)\n`);

    const byCadence = new Map<string, number>();
    for (const p of normalised) {
      const c = cadence(p.intervalDays);
      byCadence.set(c, (byCadence.get(c) ?? 0) + 1);
    }
    console.log("patterns by cadence:", [...byCadence].map(([k, v]) => `${k}=${v}`).join("  ") || "(none)");

    const byKey = new Map<string, Row[]>();
    for (const r of expenses) {
      const k = normalizeMerchant(r.description);
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k)!.push(r);
    }

    console.log("\n-- every candidate, with the dates and amounts that made it a match --");
    console.log("-- NOTHING here is auto-confirmed; each is a proposal --");
    for (const p of normalised) {
      const hits = (byKey.get(p.normalizedKey) ?? [])
        .filter((r) => r.currency === p.currency)
        .sort((a, b) => a.date.localeCompare(b.date));
      console.log(`\n${safeName(p.displayName)}  [${cadence(p.intervalDays)}, every ~${p.intervalDays}d, ${p.occurrenceCount}x, ${p.currency}]`);
      console.log(`  next expected ${p.nextExpected} @ ${p.expectedAmount}`);
      for (const h of hits) {
        console.log(`  ${h.date}  ${String(Math.abs(parseFloat(h.nativeAmount))).padStart(10)} ${h.currency}  (${h.source})`);
      }
    }
    console.log();

    // -- 6. What MIN_OCCURRENCES=3 excludes -------------------------------
    console.log("== 6. WHAT MIN_OCCURRENCES=3 EXCLUDES ==");
    let twoOcc = 0;
    let twoOccAnnual = 0;
    const annualNearMiss: string[] = [];
    for (const [k, rs] of byKey) {
      const byCur = new Map<string, Row[]>();
      for (const r of rs) {
        if (!byCur.has(r.currency)) byCur.set(r.currency, []);
        byCur.get(r.currency)!.push(r);
      }
      for (const [cur, list] of byCur) {
        if (list.length !== 2) continue;
        twoOcc++;
        const s = [...list].sort((a, b) => a.date.localeCompare(b.date));
        const gap = Math.round((new Date(s[1].date).getTime() - new Date(s[0].date).getTime()) / 86400000);
        if (gap >= 300 && gap <= 430) {
          twoOccAnnual++;
          const a0 = Math.abs(parseFloat(s[0].nativeAmount));
          const a1 = Math.abs(parseFloat(s[1].nativeAmount));
          const drift = a0 > 0 ? Math.abs(a1 - a0) / a0 : 1;
          annualNearMiss.push(
            `  ${safeName(k).padEnd(30)} gap ${gap}d  ${a0} -> ${a1} ${cur}  (drift ${(drift * 100).toFixed(1)}%)  ${s[0].date} / ${s[1].date}`,
          );
        }
      }
    }
    let oneOcc = 0;
    for (const [, rs] of byKey) if (rs.length === 1) oneOcc++;
    console.log(`groups with exactly 2 occurrences        ${twoOcc}  (detector requires 3)`);
    console.log(`  ...of those, gap 300-430d (annual)     ${twoOccAnnual}`);
    console.log(`groups with exactly 1 occurrence         ${oneOcc}`);
    if (annualNearMiss.length) {
      console.log("\nannual-shaped pairs the detector structurally cannot see:");
      annualNearMiss.forEach((l) => console.log(l));
    }
    console.log();

    // -- 7. Apple, the test case. Apple is a company, so it is named. -----
    console.log("== 7. APPLE (the test case) ==");
    const appleRows = rows.filter((r) => /apple|itunes|icloud/i.test(r.description));
    console.log(`rows matching /apple|itunes|icloud/i     ${appleRows.length}`);

    const appleStored = new Map<string, number>();
    const appleNorm = new Map<string, Row[]>();
    for (const r of appleRows) {
      appleStored.set(r.description, (appleStored.get(r.description) ?? 0) + 1);
      const k = normalizeMerchant(r.description);
      if (!appleNorm.has(k)) appleNorm.set(k, []);
      appleNorm.get(k)!.push(r);
    }

    console.log(`distinct descriptors as stored          ${appleStored.size}`);
    for (const [d, n] of [...appleStored].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(4)}x  ${d}`);
    }
    console.log(`\nOLD rule /apple\\.com|apple store|itunes/i collapsed all of these to one key, "Apple".`);
    console.log(`NEW rules split them into ${appleNorm.size} keys:`);
    for (const [k, rs] of [...appleNorm].sort((a, b) => b[1].length - a[1].length)) {
      const s = [...rs].sort((a, b) => a.date.localeCompare(b.date));
      console.log(`\n  "${k}"  ${rs.length} rows  ${s[0].date} -> ${s[s.length - 1].date}  src=${[...new Set(s.map((r) => r.source))].join("/")}`);
      for (const r of s) {
        console.log(`    ${r.date}  ${String(Math.abs(parseFloat(r.nativeAmount))).padStart(10)} ${r.currency}   raw="${r.description}"`);
      }
    }

    const appleFound = normalised.filter((p) => /apple|itunes|icloud/i.test(p.normalizedKey));
    console.log(`\nApple-family keys the detector FOUND: ${appleFound.map((p) => `${p.normalizedKey} (${p.occurrenceCount}x / ${p.intervalDays}d)`).join(", ") || "NONE"}`);
    const devKey = [...appleNorm.keys()].find((k) => /developer/i.test(k));
    console.log(`Apple Developer licence present in ledger: ${devKey ? `YES as "${devKey}" (${appleNorm.get(devKey)!.length} occurrences)` : "NO descriptor mentions 'developer'"}`);

    await client.query("ROLLBACK");
    console.log("\n[shape] rolled back; nothing was written.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
