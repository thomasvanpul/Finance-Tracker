// F5 refusals — source-level lock.
//
// The rules from docs/F5-PROGRESSION.md are non-negotiable. This
// test locks the parts that are grep-detectable so a well-meaning
// future edit that adds a streak counter or a spending-based XP
// event fails loudly rather than silently changing the mechanic.
//
// What we lock:
//
//   1. No transaction-based XP earning. The XP layer must not
//      reference transaction counts, spend totals, or debt
//      magnitude anywhere in learn-xp.ts / use-total-xp.ts.
//   2. No streak / daily-login counter. No STREAK, DAILY_LOGIN,
//      LAST_LOGIN, session_count identifier appears.
//   3. Every XP earning constant is named XP_* so a grep for
//      XP_ finds every rule of the form "if user did X, +N XP".
//
// The scan is deliberately narrow: it reads only learn-xp.ts and
// use-total-xp.ts. Application code CAN reference transactions
// or streaks for unrelated reasons (transactions render as a
// list, for instance) — this test just makes sure the XP module
// itself never grows those references. The narrowness is what
// makes the lock cheap enough to keep in the tree forever.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SRC = join(dirname(__filename), "..");

function read(rel: string): string {
  return readFileSync(join(SRC, rel), "utf-8");
}

// Discover the XP surface at runtime instead of hardcoding it.
//
// History: this used to be a hardcoded list of two files
// (`lib/learn-xp.ts`, `hooks/use-total-xp.ts`). On 30 Aug the second
// file was deleted with the XP-block removal from profile + settings,
// and the fix that removed it from the list — one line — silently
// deleted 17 generated `it()` assertions (one per BANNED_TOKEN). The
// lock ran green with half its coverage gone.
//
// The fix is to discover the surface. Any file under `lib/` or
// `hooks/` whose name matches an XP-adjacent naming pattern
// (`*xp*.ts` case-insensitive, or `learn-*.ts`) is treated as part of
// the XP module surface and scanned automatically. `.test.ts` files
// are excluded — the lock protects production code, not the lock
// itself.
//
// Two discovery guards below enforce that this discovery mechanism
// cannot itself become the silent-failure path: XP_FILES must be
// non-empty, and it must always include `lib/learn-xp.ts` (the
// canonical constants file). A future rename would fail the second
// guard and force a deliberate decision rather than a quiet zero.
function discoverXpFiles(): string[] {
  const found: string[] = [];
  const scan = (subdir: string, matcher: (name: string) => boolean) => {
    const abs = join(SRC, subdir);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      if (matcher(entry.name)) found.push(`${subdir}/${entry.name}`);
    }
  };
  // Match `xp` as a hyphen/underscore-delimited token so
  // `shared-expenses-hook.ts` does not trip on the "xp" inside
  // "expenses". Also match `learn-*` as the canonical prefix for
  // future learn-related XP files (e.g. `learn-quiz.ts`).
  const isXpName = (n: string) =>
    /(^|[-_])xp([-_.]|$)/i.test(n) || /^learn-/i.test(n);
  scan("lib", isXpName);
  scan("hooks", isXpName);
  return found.sort();
}

const XP_FILES = discoverXpFiles();

// Words that would indicate a banned earning event. Lowercased
// for a case-insensitive substring match. If any of these appears
// in the XP module surface, the mechanic has drifted from the
// proposal.
const BANNED_TOKENS = [
  // Streak / urgency mechanics
  "streak",
  "daily_login",
  "dailylogin",
  "days_active",
  "daysactive",
  "session_count",
  "sessioncount",
  "last_login",
  "lastlogin",
  // Spending / debt-based rewards
  "spend_total",
  "spendtotal",
  "transaction_count",
  "transactioncount",
  "debt_paid",
  "debtpaid",
  "loan_settled",
  "loansettled",
];

describe("F5 refusals — XP surface discovery", () => {
  it("discovers at least one XP file (empty surface = silent lock)", () => {
    expect(XP_FILES.length).toBeGreaterThan(0);
  });
  it("always includes lib/learn-xp.ts (canonical XP constants file)", () => {
    expect(XP_FILES).toContain("lib/learn-xp.ts");
  });
});

describe("F5 refusals — no banned earning events reach the XP module", () => {
  for (const rel of XP_FILES) {
    const content = read(rel);
    const lowered = content.toLowerCase();
    for (const token of BANNED_TOKENS) {
      it(`${rel} does not reference "${token}"`, () => {
        // Strip comments and strings before matching so a comment
        // that explains the refusal ("this file never counts
        // streaks") doesn't false-fire.
        const codeOnly = stripCommentsAndStrings(content).toLowerCase();
        expect(codeOnly).not.toContain(token);
        // Sanity: the original content is still readable.
        expect(lowered.length).toBeGreaterThan(0);
      });
    }
  }
});

describe("F5 refusals — every XP amount is a named XP_* constant", () => {
  it("learn-xp.ts exports at least one XP_ constant per earning event", () => {
    const content = read("lib/learn-xp.ts");
    // At minimum, the F5 build ships three named XP amounts.
    expect(content).toMatch(/export\s+const\s+XP_PER_CAT_RULE\b/);
    expect(content).toMatch(/export\s+const\s+XP_PER_COMPLETED_GOAL\b/);
    expect(content).toMatch(/export\s+const\s+XP_PER_SYNCED_PROVIDER\b/);
  });
});

function stripCommentsAndStrings(src: string): string {
  // Order matters: strip block comments first, then line comments,
  // then string literals. This is a heuristic — good enough for a
  // TS module that never uses tricky nested strings; would fail on
  // a source file that uses `/*` inside a string, which none of
  // ours do.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/"([^"\\]|\\.)*"/g, '""')
    .replace(/'([^'\\]|\\.)*'/g, "''")
    .replace(/`([^`\\]|\\.)*`/g, "``");
}
