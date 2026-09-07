// Mechanical lock: a localStorage key that nothing consumes.
//
// ── The pattern this stops ──────────────────────────────────────────────────
// A control writes a value to localStorage and no read path consumes it. The
// user ticks it, types in it, saves it, gets a toast — and nothing happens.
// DESIGN.md §16 is the rule; this is the enforcement.
//
// Four instances so far, and the fourth is why this file exists:
//   1. The onboarding bank question   — collected an answer, discarded it
//   2. The category emoji field       — wrote a value nothing rendered
//   3. `SL` on the transaction row    — `ft-tx-splits`, split amounts reached
//                                       no total, no export and no server
//   4. `ft-alert-rules`               — seven alert thresholds saved under a
//                                       key whose two consumers read a
//                                       different one
//
// ── Why the obvious grep does not work ─────────────────────────────────────
// The proposed detector was "find keys that are written and never read". Run
// against this codebase it reports ZERO, and (4) was live the whole time.
//
// The reason is worth keeping, because it is the general shape: a screen that
// writes a key almost always reads it back to repopulate its own form. The
// write/read pair is complete and the key looks alive from inside the screen
// that owns it. The lie is one layer out — nobody ELSE reads it.
//
// So this file runs four checks, and the one that actually found (4) is not
// the one that was asked for:
//
//   A · READ WITH NO WRITER. A key some file reads that nothing anywhere
//       writes. This is the high-signal check: 3 hits on a 108-key codebase,
//       every one a real defect, no false positives. `nr-alert-rules` is
//       exactly this — two consumers reading a key the app never wrote.
//       A hit is usually a PREFIX TWIN: this codebase uses both `ft-` and
//       `nr-` with no rule about which, so `ft-x` written / `nr-x` read is a
//       typo that type-checks. The failure message names the twin.
//
//   B · WRITE WITH NO READER. The originally-proposed check. Currently zero,
//       which is why it is a hard gate rather than a baseline — it costs
//       nothing to keep at zero and it is a genuine defect when it is not.
//
//   C · READ ONLY BY A FILE THAT ALSO WRITES IT. The other rule that was
//       asked for. It is true of 90 of the 108 keys, and most of them are
//       fine — a page persisting its own data and rendering it back is this
//       shape and is not a defect. So it is a BASELINE, not a block: the
//       recorded set is the debt, and a NEW one fails. Same treatment, and
//       for the same reason, as `fabricated-zero-lock.test.ts`.
//
//   D · COVERAGE. Every localStorage access in `src/` must be one this file
//       can actually see. A detector with a silent blind spot is the defect
//       it is looking for, one level up — the original grep failed precisely
//       by being confidently blind. If someone adds a new storage helper, or
//       a key built at runtime, D fails until it is declared here.
//
// ── If this test fails ─────────────────────────────────────────────────────
// A and B: fix it, or delete the control, the writer and the key. Deleting is
// the default (DESIGN.md §16). Allowlist only with a reason and a tracking
// item — every entry is a screen currently lying to someone.
// C: prove an outside consumer, or add the key to the baseline.
// D: teach the accessor table below about the new shape.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename_ = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename_), "..", "..", "..", "..");
const SRC = join(REPO_ROOT, "artifacts", "finance-tracker", "src");

// ── The accessor table ─────────────────────────────────────────────────────
// Every way this codebase reads or writes a persisted key. Verified by
// grepping for the functions that take a `key` parameter and pass it to
// localStorage, rather than assumed — the first draft of this file knew only
// about localStorage.getItem/setItem and was blind to five of these.
const READ_FNS = [
  String.raw`localStorage\s*\.\s*getItem`,
  String.raw`nativeStorage\s*\.\s*get`,
  "ls",       // pages/settings.tsx:241
  "lsBool",   // pages/settings.tsx:245
  "loadLS",   // pages/family-finance.tsx:81
  "readPref", // pages/profile.tsx:380
];
const WRITE_FNS = [
  String.raw`localStorage\s*\.\s*setItem`,
  String.raw`nativeStorage\s*\.\s*set`,
  "lsSet",     // pages/settings.tsx:253
  "saveLS",    // pages/family-finance.tsx:90
  "writePref", // pages/profile.tsx:389
];

// A quoted literal, or a bare identifier to resolve against the const maps.
const ARG = String.raw`(?:(['"])([^'"\n]+)\1|([A-Za-z_$][\w$]*))`;
// The optional `<...>` is the generic argument list on `loadLS<Member[]>(K)`.
// Omitting it reported four live keys as dead — a false positive in a
// detector is worse than none, because it gets allowlisted and stays.
const accessorRe = (names: string[]) =>
  new RegExp(String.raw`(?<![\w$.])(?:${names.join("|")})\s*(?:<[^;(){}]*>\s*)?\(\s*${ARG}`, "g");

// Bulk scans over the whole store: diagnostics, export and account wipe.
// They touch every key without consuming any particular one, so they are not
// evidence that a key is read. Named so D can tell them from a blind spot.
const BULK_SCAN = /Object\.keys\(\s*localStorage\s*\)|localStorage\.clear\(/;

// Keys built at runtime rather than named. Each is a real blind spot and is
// listed so it is a known one.
const UNRESOLVED_SITES = new Set([
  // Generic wrappers — the key is the parameter, resolved at every call site.
  "artifacts/finance-tracker/src/lib/native-storage.ts: key",
  "artifacts/finance-tracker/src/pages/family-finance.tsx: key",
  "artifacts/finance-tracker/src/pages/profile.tsx: key",
  "artifacts/finance-tracker/src/pages/settings.tsx: key",
  "artifacts/finance-tracker/src/pages/settings.tsx: k",
  // Per-persona keys: `nr-quickstart-${persona}-done` / `-dismissed`.
  "artifacts/finance-tracker/src/components/persona-quick-start.tsx: doneKey",
  "artifacts/finance-tracker/src/components/persona-quick-start.tsx: dismissedKey",
]);

// ── A · read with no writer ────────────────────────────────────────────────
const READ_WITHOUT_WRITER = new Map<string, string>([
  // Deliberate, and the reason this file exists. The settings alert panel used
  // to write this key while both consumers read "nr-alert-rules". It now writes
  // the key they read and reads this one once to carry an existing
  // configuration across (pages/settings.tsx loadAlertRules). Nothing writes it
  // any more, by design — the old value is left where it is rather than
  // deleted. Removable once no device can still be holding one.
  ["ft-alert-rules", "legacy key, read once to migrate to nr-alert-rules, never written again"],
]);

// ── B · write with no reader ───────────────────────────────────────────────
// Empty, and worth keeping empty.
const WRITE_WITHOUT_READER = new Map<string, string>([]);

// ── C · baseline of same-file-only keys ────────────────────────────────────
// A page persisting its own state and rendering it back is this shape and is
// legitimate. The list is the debt register, not a list of bugs. It should
// shrink when a key gains an outside consumer, and it must not grow silently.
const SAME_FILE_BASELINE = new Set<string>([
  "ft-acct-meta", "ft-acct-onboarding-dismissed", "ft-achievements",
  "ft-analytics-annotations", "ft-balance-alerts", "ft-bill-splits",
  "ft-briefing-cache", "ft-budget-rollover", "ft-budget-rollover-month",
  "ft-business-categories", "ft-business-invoices", "ft-cal-events",
  "ft-cal-feeds", "ft-cal-imported", "ft-cat-rules", "ft-category-meta",
  "ft-chart-expand-seen", "ft-crypto-prices", "ft-crypto-wallets",
  "ft-dashboard-customize-mode", "ft-dashboard-views", "ft-decisions-dismissed",
  "ft-digest-enabled", "ft-family-budgets", "ft-family-goals",
  "ft-family-members", "ft-family-timeline", "ft-futures-positions",
  "ft-health-score-history", "ft-inv-classes", "ft-inv-orders", "ft-isa",
  "ft-isa-contributions", "ft-last-session-snapshot-v1", "ft-login-history",
  "ft-mortgages", "ft-nw-history", "ft-nw-milestones", "ft-nw-target",
  "ft-options-positions", "ft-pension", "ft-persona",
  "ft-portfolio-snapshots", "ft-price-alerts", "ft-privacy", "ft-rebalance-targets",
  "ft-sidebar",
  "ft-sidebar-width", "ft-split-my-name", "ft-tax-disposals", "ft-theme",
  "ft-tickers", "ft-trading-journal-trades", "ft-tx-notes", "ft-tx-tags",
  "ft-tx-templates", "ft-watchlists", "ft-widgets", "ft-world-clock-cities",
  "ft-amount-display", "ft-date-format", "ft-default-currency",
  "ix-companion-v1", "nr-base-currency", "nr-beta-features",
  "nr-compact-numbers", "nr-custom-categories", "nr-customize-discovered",
  "nr-debt-aprs", "nr-dev-mode", "nr-dismissed-insights", "nr-hide-from-print",
  "nr-import-history", "nr-pwa-dismissed", "nr-recurring-rules",
  "nr-show-cents", "nr-sidebar-collapsed-sections", "nr-sidebar-config",
  "nr-sidebar-more", "nr-tab-slot", "nr-tax-country", "nr-time-format",
  "nr-tx-default-category", "nr-tx-default-currency", "nr-tx-default-type",
  "nr-week-start", "numeris-ai-style", "numeris-bot-skin",
  "numeris:cashflow:multipliers",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "generated" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (
      st.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".test.ts") && !full.endsWith(".test.tsx") && !full.endsWith(".d.ts")
    ) out.push(full);
  }
  return out;
}

interface Scan {
  writes: Map<string, Set<string>>;
  reads: Map<string, Set<string>>;
  unresolved: Set<string>;
  bulkScanFiles: Set<string>;
}

function scan(): Scan {
  const files = walk(SRC);
  const sources = new Map(files.map((f) => [f, readFileSync(f, "utf-8")]));

  // `const KEY = "literal"` per file, plus exported ones visible everywhere.
  const perFile = new Map<string, Map<string, string>>();
  const exported = new Map<string, string>();
  const constRe = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=\n]+)?=\s*(['"])([^'"\n]*)\2/g;
  for (const [file, src] of sources) {
    const m = new Map<string, string>();
    for (const c of src.matchAll(constRe)) {
      m.set(c[1], c[3]);
      if (c[0].includes("export")) exported.set(c[1], c[3]);
    }
    perFile.set(file, m);
  }

  const writes = new Map<string, Set<string>>();
  const reads = new Map<string, Set<string>>();
  const unresolved = new Set<string>();
  const bulkScanFiles = new Set<string>();
  const RE_R = accessorRe(READ_FNS);
  const RE_W = accessorRe(WRITE_FNS);

  for (const [file, src] of sources) {
    const rel = relative(REPO_ROOT, file);
    const consts = perFile.get(file)!;
    if (BULK_SCAN.test(src)) bulkScanFiles.add(rel);
    const collect = (re: RegExp, bag: Map<string, Set<string>>) => {
      for (const m of src.matchAll(new RegExp(re.source, "g"))) {
        let key: string | undefined = m[2];
        if (key === undefined) {
          key = consts.get(m[3]) ?? exported.get(m[3]);
          if (key === undefined) { unresolved.add(`${rel}: ${m[3]}`); continue; }
        }
        if (!bag.has(key)) bag.set(key, new Set());
        bag.get(key)!.add(rel);
      }
    };
    collect(RE_R, reads);
    collect(RE_W, writes);
  }
  return { writes, reads, unresolved, bulkScanFiles };
}

const twinOf = (k: string) =>
  k.startsWith("ft-") ? `nr-${k.slice(3)}` : k.startsWith("nr-") ? `ft-${k.slice(3)}` : null;

describe("localStorage key lock", () => {
  const { writes, reads, unresolved } = scan();

  it("A · every key that is read is written by something", () => {
    const orphans = [...reads.keys()]
      .filter((k) => !writes.has(k) && !READ_WITHOUT_WRITER.has(k))
      .sort();
    if (orphans.length > 0) {
      const lines = orphans.map((k) => {
        const twin = twinOf(k);
        const hint = twin && writes.has(twin)
          ? `  ← PREFIX TWIN: the app writes "${twin}", this reads "${k}"`
          : "  ← nothing anywhere writes this key";
        return `  ${k}\n      read by: ${[...reads.get(k)!].join(", ")}\n    ${hint}`;
      }).join("\n");
      throw new Error(
        `${orphans.length} key(s) are read but never written:\n${lines}\n\n` +
          `Whatever writes the value the reader expects is writing it somewhere else,\n` +
          `so the feature behind it does nothing. This is the shape that hid\n` +
          `ft-alert-rules: seven saved thresholds that reached no consumer.\n\n` +
          `Fix the key, or delete the reader. Allowlist in READ_WITHOUT_WRITER only\n` +
          `with a reason and a BACKLOG item — see DESIGN.md §16.`,
      );
    }
  });

  it("B · every key that is written is read by something", () => {
    const dead = [...writes.keys()]
      .filter((k) => !reads.has(k) && !WRITE_WITHOUT_READER.has(k))
      .sort();
    if (dead.length > 0) {
      const lines = dead.map((k) => `  ${k}\n      written by: ${[...writes.get(k)!].join(", ")}`).join("\n");
      throw new Error(
        `${dead.length} key(s) are written and never read:\n${lines}\n\n` +
          `A control that saves a value nothing consumes does not change what the\n` +
          `user sees. DESIGN.md §16: land the read path in the same change, or\n` +
          `delete the control, the writer and the key. Deleting is the default.`,
      );
    }
  });

  it("C · no NEW key is read only by a file that also writes it", () => {
    const sameFileOnly = [...writes.keys()].filter((k) => {
      const r = reads.get(k);
      if (r === undefined || r.size === 0) return false;
      return [...r].every((f) => writes.get(k)!.has(f));
    });
    const additions = sameFileOnly.filter((k) => !SAME_FILE_BASELINE.has(k)).sort();
    if (additions.length > 0) {
      throw new Error(
        `${additions.length} new key(s) are read only by the file that writes them:\n` +
          additions.map((k) => `  + ${k}  (${[...writes.get(k)!].join(", ")})`).join("\n") +
          `\n\nThis is legitimate when a page persists its own data and renders it back.\n` +
          `It is the ft-alert-rules shape when the read only repopulates the control\n` +
          `that wrote it — the screen looks alive from inside and does nothing outside.\n` +
          `Decide which, then either wire up the outside consumer or add the key to\n` +
          `SAME_FILE_BASELINE.`,
      );
    }
  });

  it("C · the same-file baseline is not stale", () => {
    const allKeys = new Set([...writes.keys(), ...reads.keys()]);
    const gone = [...SAME_FILE_BASELINE].filter((k) => !allKeys.has(k)).sort();
    expect(
      gone,
      `These keys are in SAME_FILE_BASELINE but no longer exist in src/. ` +
        `Remove them so the baseline shrinks: ${gone.join(", ")}`,
    ).toEqual([]);
  });

  it("D · this test can see every storage access in src/", () => {
    const surprises = [...unresolved].filter((u) => !UNRESOLVED_SITES.has(u)).sort();
    if (surprises.length > 0) {
      throw new Error(
        `${surprises.length} storage access(es) use a key this test cannot resolve:\n` +
          surprises.map((s) => `  ${s}`).join("\n") +
          `\n\nA detector with a blind spot is the defect it is looking for. The grep\n` +
          `this file replaced reported zero dead keys while ft-alert-rules was live,\n` +
          `because it could not see through the key constants.\n\n` +
          `Either resolve the key to a literal, or add the site to UNRESOLVED_SITES\n` +
          `with a note saying what the key is built from.`,
      );
    }
  });

  it("D · the declared blind spots still exist", () => {
    const stale = [...UNRESOLVED_SITES].filter((u) => !unresolved.has(u)).sort();
    expect(
      stale,
      `These UNRESOLVED_SITES entries no longer match anything — remove them: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});
