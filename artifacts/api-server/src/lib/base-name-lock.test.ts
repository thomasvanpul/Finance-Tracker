// Lock — a base-currency schema field's NAME must match its VALUE.
//
// This exists because the §25 rename to baseEquivalent covered
// Account, UpcomingBill, Debt, and the dashboard-inline account
// schema — and missed Transaction, Investment, and the
// InvestmentSummary totals. That split contract shipped for weeks.
// Then the 30-Aug correctness commit found enrich-investment.ts
// dividing by fx.rates[currency] and returning the quotient under a
// name that stamped it with the user's base symbol — literal GBP
// digits under an "RM" label for a base-MYR user. Wrong numbers
// wearing the right currency symbol, the worst class of financial
// defect the app can ship.
//
// TWO directions of the same bug class:
//
//   Direction A — MISNAMED. A schema field whose name claims GBP
//   (identifier ends in Gbp) is computed via toBase() and therefore
//   holds the user's base currency, not literal GBP. This was the
//   Transaction.gbpValue + Investment.plGbp + totalValueGbp split.
//
//   Direction B — MISCOMPUTED. A schema field whose name claims base
//   (identifier ends in Equivalent or Base) is emitted by a file
//   that never references toBase, getBaseCurrency, or the
//   `baseCurrency` identifier. This was enrich-investment.ts:
//   returned `gbpValue`/`plGbp` with a body that never read the
//   user's base. Direction B is the one that shipped WRONG NUMBERS
//   for months; Direction A shipped a lie about a right number.
//
// Both directions bite here. Direction B is the priority — it's the
// one that produced miscomputed digits — and if only one direction
// could be caught cleanly it would be that one.
//
// Scan scope: artifacts/api-server/src. Response builders (routes/
// and lib/enrich-*.ts) live here; frontend files READ base-named
// fields but don't construct them, so scanning them would produce
// false positives on every widget.
//
// Test files are excluded from the scan — they intentionally
// exercise malformed shapes.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const API_SERVER_SRC = join(dirname(__filename), "..");
const REPO_ROOT = join(API_SERVER_SRC, "..", "..", "..", "..");

// Identifiers whose Gbp-ness is real (they literally return / target GBP)
// and therefore MUST retain the Gbp name. Kept small and visible in the
// diff.
const GBP_ALLOWLIST = new Set([
  "toGbp",    // market.ts helper: any currency → GBP via Frankfurter pivot
  "gbpTo",    // market.ts helper: GBP → any currency
  "GBP",      // ISO currency string literal
]);

// Property keys in api-server sources that identify a value as base-
// currency-denominated. Kept literal so the lock message names the
// offending field precisely.
const BASE_PROPERTY_KEYS = [
  "baseEquivalent",
  "plBase",
  "totalValueBase",
  "totalPlBase",
  "totalCostBase",
  "dayChangeBase",
  "dayChangePrevValueBase",
  "portfolioValueBase",
  "portfolioCostBase",
  "portfolioPlBase",
] as const;

// Anchors that prove a file participates in base-currency computation
// (rather than merely passing through a value it received).
const BASE_COMPUTATION_ANCHORS = [
  /\btoBase\s*\(/,
  /\bgetBaseCurrency\s*\(/,
  /\bbaseCurrency\b/,
];

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".tsbuildinfo") continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) acc.push(p);
  }
  return acc;
}

interface ScanOutcome {
  file: string;
  matches: Array<{ line: number; snippet: string }>;
}

// ── DIRECTION A: misnamed identifiers ─────────────────────────────────
// An identifier ending in `Gbp` (word-boundary or camel boundary) that
// isn't allowlisted. Matches `gbpValue`, `plGbp`, `totalValueGbp`,
// `dayChangeGbp` on either side of an assignment or a property key.
// Excludes comment text and string literals: `"GBP"` in a currency
// check doesn't count.
function scanDirectionA(text: string, path: string): ScanOutcome {
  const matches: Array<{ line: number; snippet: string }> = [];
  const lines = text.split("\n");
  const identifierRe = /\b([A-Za-z_$][A-Za-z0-9_$]*Gbp)\b(?!["'`])/g;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Skip full-line comments. Inline // comments after code still get
    // scanned — dropping the whole line on `//` would let a comment
    // hide a real identifier on the same line above.
    const trimmed = raw.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

    // Strip string literals so identifiers inside them (rare, but
    // possible in a template) don't false-positive.
    const stripped = raw
      .replace(/"[^"]*"/g, '""')
      .replace(/'[^']*'/g, "''")
      .replace(/`[^`]*`/g, "``");

    for (const match of stripped.matchAll(identifierRe)) {
      const name = match[1];
      if (GBP_ALLOWLIST.has(name)) continue;
      matches.push({ line: i + 1, snippet: raw.trim() });
    }
  }

  return { file: path, matches };
}

// ── DIRECTION B: miscomputed base-named fields ────────────────────────
// A file that emits a property key from BASE_PROPERTY_KEYS but never
// references any of the BASE_COMPUTATION_ANCHORS. That's the exact
// shape of enrich-investment.ts pre-fix: property key `gbpValue`
// (post-rename it would be `baseEquivalent`), body that divided by
// fx.rates[...] with no `toBase` and no `baseCurrency`.
function scanDirectionB(text: string, path: string): ScanOutcome {
  const matches: Array<{ line: number; snippet: string }> = [];
  const lines = text.split("\n");

  // Fast path: does the file mention any base property key at all?
  const keyRe = new RegExp(
    `\\b(${BASE_PROPERTY_KEYS.join("|")})\\s*:`,
    "g",
  );
  const keyHits: Array<{ line: number; snippet: string; key: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    for (const m of raw.matchAll(keyRe)) {
      keyHits.push({ line: i + 1, snippet: raw.trim(), key: m[1] });
    }
  }
  if (keyHits.length === 0) return { file: path, matches: [] };

  // File emits a base-named field. Verify it also references at least
  // one base-computation anchor somewhere in the same file.
  const hasAnchor = BASE_COMPUTATION_ANCHORS.some((re) => re.test(text));
  if (hasAnchor) return { file: path, matches: [] };

  // No anchor and yet a base-named field. Every key hit is a suspect.
  for (const h of keyHits) matches.push({ line: h.line, snippet: h.snippet });
  return { file: path, matches };
}

// ── Live scan of the codebase ─────────────────────────────────────────

describe("base-name lock (§b/commit-4) — direction A: no misnamed Gbp identifiers", () => {
  const files = walk(API_SERVER_SRC);

  it("no identifier in api-server/src ends in `Gbp` except the toGbp/gbpTo helpers", () => {
    const offenders: ScanOutcome[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const outcome = scanDirectionA(text, relative(REPO_ROOT, file));
      if (outcome.matches.length > 0) offenders.push(outcome);
    }
    if (offenders.length > 0) {
      const detail = offenders
        .map((o) => `  ${o.file}:\n` + o.matches.map((m) => `    :${m.line}  ${m.snippet}`).join("\n"))
        .join("\n\n");
      throw new Error(
        "Direction A · misnamed field. An identifier ending in `Gbp` is present " +
          "in api-server. A base-currency value must not wear a GBP name — that was " +
          "the split contract lie (Transaction.gbpValue, Investment.plGbp, " +
          "totalValueGbp) the 30-Aug rename closed. Either rename to *Base, or add " +
          "the identifier to GBP_ALLOWLIST with a one-line WHY.\n\n" +
          detail,
      );
    }
  });
});

describe("base-name lock (§b/commit-4) — direction B: no miscomputed base fields", () => {
  const files = walk(API_SERVER_SRC);

  it("every file emitting a base-named field also references toBase / getBaseCurrency / baseCurrency", () => {
    const offenders: ScanOutcome[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const outcome = scanDirectionB(text, relative(REPO_ROOT, file));
      if (outcome.matches.length > 0) offenders.push(outcome);
    }
    if (offenders.length > 0) {
      const detail = offenders
        .map((o) => `  ${o.file}:\n` + o.matches.map((m) => `    :${m.line}  ${m.snippet}`).join("\n"))
        .join("\n\n");
      throw new Error(
        "Direction B · miscomputed base field. This file emits a property named " +
          "for base currency but never references toBase(), getBaseCurrency(), or " +
          "`baseCurrency`. That's the enrich-investment defect exactly — a field " +
          "whose value is computed against literal GBP shipped under a base name " +
          "and the frontend stamped the user's base symbol on it. Compute the " +
          "value via toBase() and read the user's base via getBaseCurrency().\n\n" +
          detail,
      );
    }
  });
});

// ── Bite proofs ───────────────────────────────────────────────────────
// Injection tests that prove both detectors identify a defect when
// handed a synthetic source. The bite is verified every test run and
// doesn't require file writes. Fixture strings are kept literal and
// short so the intent is obvious.

describe("base-name lock — direction A bite proof", () => {
  it("fires on a Gbp-suffixed identifier in a property key", () => {
    const source = `
      function returnResponse(base: number) {
        return {
          id: 1,
          netWorthGbp: base,       // ← identifier ending in Gbp
        };
      }
    `;
    const result = scanDirectionA(source, "fixture.ts");
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].snippet).toContain("netWorthGbp");
  });

  it("fires on a local variable name ending in Gbp", () => {
    const source = `
      const rawGbp = await toBase(amount, currency, baseCurrency);
      return { baseEquivalent: rawGbp };
    `;
    const result = scanDirectionA(source, "fixture.ts");
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it("does NOT fire on the toGbp / gbpTo helpers (allowlisted)", () => {
    const source = `
      export async function toGbp(amount: number, currency: string) {}
      export async function gbpTo(gbp: number, target: string) {}
    `;
    const result = scanDirectionA(source, "fixture.ts");
    expect(result.matches.length).toBe(0);
  });

  it("does NOT fire on the string literal \"GBP\"", () => {
    const source = `
      if (currency === "GBP") return amount;
    `;
    const result = scanDirectionA(source, "fixture.ts");
    expect(result.matches.length).toBe(0);
  });

  it("does NOT fire on a comment mentioning Gbp", () => {
    const source = `
      // Previously named gbpValue; renamed 30-Aug to baseEquivalent.
      const baseEquivalent = 42;
    `;
    const result = scanDirectionA(source, "fixture.ts");
    expect(result.matches.length).toBe(0);
  });
});

describe("base-name lock — direction B bite proof (the enrich-investment defect exactly)", () => {
  it("fires on a file that emits baseEquivalent without any base-computation anchor", () => {
    // This is the enrich-investment.ts pre-fix shape, transliterated:
    // the file returns a `baseEquivalent` field computed from
    // fx.rates[currency] with no reference to the user's base.
    const source = `
      export function enrichInvestment(inv, priceMap, fx) {
        const currency = "USD";
        const fxRate = fx.rates[currency] ?? 1;
        const currentValue = 100;
        return {
          currentValue,
          baseEquivalent: currentValue / fxRate,   // ← miscomputed under a base name
        };
      }
    `;
    const result = scanDirectionB(source, "fixture.ts");
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].snippet).toContain("baseEquivalent");
  });

  it("fires on a plBase field with no baseCurrency reference", () => {
    const source = `
      export function summary() {
        const totalValue = 1000;
        return {
          totalValueBase: totalValue,
          plBase: totalValue - 800,
        };
      }
    `;
    const result = scanDirectionB(source, "fixture.ts");
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it("does NOT fire when the same file references toBase()", () => {
    const source = `
      import { toBase } from "./market";
      export async function build(currency: string, base: string) {
        const value = await toBase(100, currency, base);
        return { baseEquivalent: value };
      }
    `;
    const result = scanDirectionB(source, "fixture.ts");
    expect(result.matches.length).toBe(0);
  });

  it("does NOT fire when the file reads baseCurrency without calling toBase()", () => {
    // The "aggregate consumer" case — a route pulls a per-row
    // baseEquivalent up into a summary, using the row's own value.
    // Reading `baseCurrency` proves the file is base-aware even if it
    // doesn't do the toBase() call itself.
    const source = `
      export function summary(rows, baseCurrency: string) {
        const total = rows.reduce((s, r) => s + r.baseEquivalent, 0);
        return { totalValueBase: total, baseCurrency };
      }
    `;
    const result = scanDirectionB(source, "fixture.ts");
    expect(result.matches.length).toBe(0);
  });

  it("does NOT fire when the file references getBaseCurrency()", () => {
    const source = `
      import { getBaseCurrency } from "./app-settings-db";
      export async function build(userId: string) {
        const base = await getBaseCurrency(userId);
        return { baseEquivalent: 100, base };
      }
    `;
    const result = scanDirectionB(source, "fixture.ts");
    expect(result.matches.length).toBe(0);
  });
});
