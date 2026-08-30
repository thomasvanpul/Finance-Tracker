// Mechanical lock: no NEW `?? 0` on nullable money fields.
//
// ── The pattern this stops ──────────────────────────────────────────────────
// A money field whose null-ness carries "we could not convert this" gets
// summed with `?? 0`. The account without an FX rate silently contributes
// £0 to the total. The user reads their net worth as smaller than reality
// with no signal.
//
// This has recurred six times so far:
//   1. Monthly fold in the dashboard endpoint  (fixed via null-poison)
//   2. Running balance in the cash-flow table  (fixed via null-poison)
//   3. Income-statement column totals           (fixed via null-poison)
//   4. Cash-flow chart average line             (fixed via avgNonNull)
//   5. Spending-consistency score               (fixed via nullable filter)
//   6. Desktop account totals                   (surfaced by offline work)
//
// (5) was fixed by hand; (6) surfaced only because offline made it visible.
// Five of the six were found by the FX-null flag one commit at a time; the
// codebase clearly reproduces this pattern without a mechanical guard.
//
// ── Why a baseline snapshot, not a hard block ──────────────────────────────
// A hard block would fail today with 120+ existing hits — surveyed via
// `grep -rEn '\b(baseEquivalent|gbpValue|totalValueGbp|totalPlGbp|plGbp|
// netGbp|amountGbp|totalCashGbp|convertedGbp|equivalentGbp)\s*\?\?\s*0\b'`
// across src/. Refactoring all of them at once is a separate project.
//
// The baseline records file paths that CURRENTLY contain the pattern. The
// test:
//   • Passes when the observed set equals the baseline (steady state).
//   • Passes when the observed set is a SUBSET (someone fixed one — nudge
//     to regenerate the baseline).
//   • FAILS when the observed set adds a file not in the baseline. That's
//     the recurrence the user asked to stop mechanically.
//
// Line numbers are deliberately NOT baselined — they churn on every edit.
// File-level granularity is enough to catch a new site while tolerating
// unrelated changes in the same file.
//
// ── If this test fails on a legitimate edit ────────────────────────────────
// You added a `?? 0` on a money field in a file that previously had none.
// Two options:
//   1. Fix it. Use a null-poisoning aggregator (see lib/market.ts fold),
//      an nfilter (avgNonNull), or surface the count of unconvertible
//      rows so the total isn't silently short (UnconvertibleAccountsBadge).
//   2. If you genuinely have a case where `?? 0` is right (a display
//      fallback where 0 is semantically correct, e.g. an initial state
//      before user input), add the file to BASELINE_FILES with a
//      one-line WHY comment. Every entry there is a debt line item.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");
const SCAN_ROOTS = [
  join(REPO_ROOT, "artifacts", "finance-tracker", "src"),
  join(REPO_ROOT, "artifacts", "api-server", "src"),
];

// Money-field vocabulary. Deliberately narrow: names whose null-ness is
// specifically the FX-conversion-unavailable signal.
//
// Included:
//   • baseEquivalent  — accounts, debts, upcoming, subscriptions
//   • gbpValue       — transactions, investments
//   • *Gbp           — totalValueGbp, totalCashGbp, totalPlGbp, netGbp, plGbp
//                      (matched by suffix; matches ANY identifier ending in Gbp)
//   • convertedGbp / equivalentGbp — reserved for future use
//
// Deliberately excluded (would produce false positives — the null-ness
// isn't FX-driven):
//   • income, expenses, netSavings — the FX-null work already made these
//     nullable at the response level, but there are many uses where `?? 0`
//     is a display fallback for "no data yet" rather than a silent drop.
//     Locked separately via the monthly-fold contract test.
//   • balance — native account balance, non-nullable on the wire.
//   • annualCost — application-computed, not FX-derived.
const MONEY_FIELD_PATTERN = /\b(?:baseEquivalent|gbpValue|convertedGbp|equivalentGbp|[A-Za-z]+Gbp)\s*\?\?\s*0\b/;

// Files whose paths (relative to REPO_ROOT) currently contain the pattern.
// Regenerate via: pnpm --filter @workspace/finance-tracker test -- --run fabricated-zero-lock
// then paste the "current set" printed by the diagnostic block below.
//
// EVERY ENTRY HERE IS TECHNICAL DEBT. New entries should not be added
// casually — they're a promise that the file has at least one silent-
// underreport site the codebase has agreed to tolerate. Prefer fixing.
const BASELINE_FILES: ReadonlySet<string> = new Set([
  "artifacts/api-server/src/routes/dashboard.ts",
  // routes/investments.ts removed 30-Aug — the two `?? 0` reduces in
  // /investments/summary were the file's only fabrication sites. The
  // 30-Aug enrich-investment correctness fix filters null-value rows
  // explicitly before summing, matching the shape used for missing-price
  // rows. Same pass fixed the plPercent divisor-guard (`: 0` → `: null`).
  "artifacts/finance-tracker/src/components/global-search.tsx",
  "artifacts/finance-tracker/src/components/mobile/MobileAccounts.tsx",
  "artifacts/finance-tracker/src/components/mobile/MobileAnalytics.tsx",
  // MobileHome.tsx removed 26-Aug — same Correction-3 sweep: portfolio total
  // in computeHoldings, hero net worth / mtd delta / unconvertible / owing
  // are now all nullable-guarded.
  // MobileNetWorth.tsx removed 26-Aug — Correction 3 rewrote every
  // `?? 0` on money fields in this file (netWorth, mtdDelta, unconvertible,
  // owing summary, portfolio total) into loading/unknown/real-0 handling.
  "artifacts/finance-tracker/src/components/mobile/widgets.tsx",
  "artifacts/finance-tracker/src/components/notifications-panel.tsx",
  "artifacts/finance-tracker/src/components/widgets/accounts-summary.tsx",
  "artifacts/finance-tracker/src/components/widgets/budget-tracker.tsx",
  "artifacts/finance-tracker/src/components/widgets/cash-runway.tsx",
  "artifacts/finance-tracker/src/components/widgets/compact-tiles.tsx",
  "artifacts/finance-tracker/src/components/widgets/daily-spend.tsx",
  "artifacts/finance-tracker/src/components/widgets/decision-engine.tsx",
  "artifacts/finance-tracker/src/components/widgets/month-comparison.tsx",
  "artifacts/finance-tracker/src/components/widgets/net-worth.tsx",
  "artifacts/finance-tracker/src/components/widgets/recent-transactions.tsx",
  "artifacts/finance-tracker/src/components/widgets/smart-alerts.tsx",
  "artifacts/finance-tracker/src/components/widgets/spending-breakdown.tsx",
  "artifacts/finance-tracker/src/components/widgets/spending-forecast.tsx",
  "artifacts/finance-tracker/src/components/widgets/subscription-tracker.tsx",
  "artifacts/finance-tracker/src/components/widgets/top-merchants.tsx",
  "artifacts/finance-tracker/src/pages/accounts.tsx",
  "artifacts/finance-tracker/src/pages/budget.tsx",
  "artifacts/finance-tracker/src/pages/business.tsx",
  "artifacts/finance-tracker/src/pages/calendar.tsx",
  "artifacts/finance-tracker/src/pages/cashflow.tsx",
  "artifacts/finance-tracker/src/pages/dashboard.tsx",
  "artifacts/finance-tracker/src/pages/decisions.tsx",
  "artifacts/finance-tracker/src/pages/family-finance.tsx",
  "artifacts/finance-tracker/src/pages/fire.tsx",
  "artifacts/finance-tracker/src/pages/health-score.tsx",
  "artifacts/finance-tracker/src/pages/investments.tsx",
  "artifacts/finance-tracker/src/pages/net-worth-history.tsx",
  "artifacts/finance-tracker/src/pages/projection.tsx",
  "artifacts/finance-tracker/src/pages/tax.tsx",
  "artifacts/finance-tracker/src/pages/upcoming.tsx",
  "artifacts/finance-tracker/src/pages/whatif.tsx",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    // Skip generated / test / build outputs to avoid false positives.
    if (
      entry === "node_modules" ||
      entry === "dist" ||
      entry === "generated" ||
      entry === ".git" ||
      entry.startsWith(".")
    ) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (
      st.isFile() &&
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".test.tsx") &&
      !full.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

function scan(): Set<string> {
  const hits = new Set<string>();
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      const src = readFileSync(file, "utf-8");
      if (MONEY_FIELD_PATTERN.test(src)) {
        hits.add(relative(REPO_ROOT, file));
      }
    }
  }
  return hits;
}

describe("fabricated-zero recurrence lock", () => {
  const current = scan();

  it("no new file contains `?? 0` on a nullable money field", () => {
    const additions = [...current].filter((f) => !BASELINE_FILES.has(f)).sort();
    if (additions.length > 0) {
      const lines = additions.map((f) => `  + ${f}`).join("\n");
      throw new Error(
        `Found ${additions.length} new file(s) with the fabricated-zero pattern:\n${lines}\n\n` +
          `The pattern is: <identifier ending in Gbp> ?? 0, or the aliases baseEquivalent / gbpValue.\n` +
          `Each one is a silent-underreport site: a null-value (usually because FX conversion\n` +
          `was unavailable) gets treated as £0, and the total is smaller than reality with no\n` +
          `signal to the user.\n\n` +
          `Two options:\n` +
          `  1. Fix it. Use a null-poisoning aggregator (see lib/market.ts fxRatesFromYahoo),\n` +
          `     an nfilter (see cash-flow.tsx avgNonNull), or surface the unconvertible count\n` +
          `     via UnconvertibleAccountsBadge alongside the total.\n` +
          `  2. If \`?? 0\` is genuinely correct here (display fallback where 0 is semantically\n` +
          `     right), add the file to BASELINE_FILES with a one-line WHY comment.\n\n` +
          `See fabricated-zero-lock.test.ts header for the full argument.`,
      );
    }
  });

  it("baseline is not stale — every file in it still contains the pattern", () => {
    const removed = [...BASELINE_FILES].filter((f) => !current.has(f)).sort();
    if (removed.length > 0) {
      const lines = removed.map((f) => `  - ${f}`).join("\n");
      throw new Error(
        `Good news: ${removed.length} file(s) no longer contain the fabricated-zero pattern.\n${lines}\n\n` +
          `Remove them from BASELINE_FILES in fabricated-zero-lock.test.ts so the baseline\n` +
          `shrinks over time. Every removal is real progress against a defect class the\n` +
          `codebase kept reproducing.`,
      );
    }
  });
});
