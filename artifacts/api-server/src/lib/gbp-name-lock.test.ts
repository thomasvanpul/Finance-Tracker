// Lock — no identifier in api-server ends in `Gbp` except the toGbp /
// gbpTo helpers.
//
// Prevents the misnamed-field half of the split contract lie the §25
// rename + 30-Aug sweep closed: a schema field whose value is
// computed via toBase() (base-currency) shouldn't wear a name that
// claims GBP. That was Transaction.gbpValue, Investment.plGbp,
// totalValueGbp, DebtSummary.netGbp, DashboardSummary.owing.netGbp,
// topPending[].amountGbp, and internal locals (valueGbp / dayGbp /
// dayPrevGbp / costGbp) in dashboard.ts. Frontend formatBaseMoney()
// would stamp the user's base symbol on the number, so a base-MYR
// user saw an "RM" label on what the API kept calling GBP.
//
// A name scan is the right tool for a name check. That is what this
// lock does, and only that.
//
// ── What this lock does NOT catch ─────────────────────────────────────
// The other half of the same bug class — a base-NAMED field whose
// VALUE is computed without ever reading the user's base currency
// (the enrich-investment defect exactly) — is DATAFLOW, not
// naming. A source scan cannot verify that variable X actually
// influences returned value Y. Any presence check for `baseCurrency`
// or `toBase(` is satisfied by a function parameter, an unused
// import, or a comment — while the value is computed wrong. The
// earlier draft of this lock tried a presence check for exactly
// that direction; injection reproduced the pre-49ab852 defect
// (`const toRate = 1;` in enrich-investment.ts) and every test
// passed. A lock that passes on its own defect is worse than no
// lock — it makes people stop looking.
//
// The right tool for the miscomputed-value direction is a
// BEHAVIOURAL regression test: two calls to the enricher with two
// different base currencies must produce two different results.
// `enrich-investment.test.ts` already does this ("returns the USER's
// base equivalent, not literal GBP, for a base-MYR user"). Any new
// endpoint that emits a base-named field earns the same shape of
// test in its own file. Behavioural tests catch miscomputation;
// source scans catch misnaming. Each tool is used for what it can
// do, and the boundary between them is stated here so a future
// contributor doesn't try to fold miscomputation-detection back
// into a source scan.
//
// Scan scope: artifacts/api-server/src, .ts files, tests excluded.

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

// An identifier ending in `Gbp` (word-boundary or camel boundary) that
// isn't allowlisted. Matches `gbpValue`, `plGbp`, `totalValueGbp`,
// `dayChangeGbp`, `netWorthGbp` etc. on either side of an assignment
// or a property key. Excludes full-line comments and string literals:
// `"GBP"` in a currency check doesn't count, nor does a comment
// mentioning `gbpValue` as history.
function scanGbpIdentifiers(text: string, path: string): ScanOutcome {
  const matches: Array<{ line: number; snippet: string }> = [];
  const lines = text.split("\n");
  const identifierRe = /\b([A-Za-z_$][A-Za-z0-9_$]*Gbp)\b(?!["'`])/g;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Skip full-line comments. Inline // comments after code still
    // get scanned — dropping the whole line on `//` would let a
    // comment hide a real identifier on the same line above.
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

describe("gbp-name lock — no identifier in api-server/src ends in Gbp except toGbp / gbpTo", () => {
  const files = walk(API_SERVER_SRC);

  it("finds no unallowlisted Gbp-suffixed identifiers in the current tree", () => {
    const offenders: ScanOutcome[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const outcome = scanGbpIdentifiers(text, relative(REPO_ROOT, file));
      if (outcome.matches.length > 0) offenders.push(outcome);
    }
    if (offenders.length > 0) {
      const detail = offenders
        .map((o) => `  ${o.file}:\n` + o.matches.map((m) => `    :${m.line}  ${m.snippet}`).join("\n"))
        .join("\n\n");
      throw new Error(
        "Misnamed field. An identifier ending in `Gbp` is present in api-server. " +
          "A base-currency value must not wear a GBP name — that was the split " +
          "contract lie (Transaction.gbpValue, Investment.plGbp, totalValueGbp, " +
          "netGbp, amountGbp) the 30-Aug rename closed. Either rename to *Base, " +
          "or add the identifier to GBP_ALLOWLIST with a one-line WHY.\n\n" +
          detail,
      );
    }
  });
});

// ── Bite proofs ──────────────────────────────────────────────────────
// Injection tests that prove the detector identifies a defect when
// handed a synthetic source. The bite is verified every test run and
// doesn't require file writes.

describe("gbp-name lock — bite proofs", () => {
  it("fires on a Gbp-suffixed identifier in a property key", () => {
    const source = `
      function returnResponse(base: number) {
        return {
          id: 1,
          netWorthGbp: base,       // ← identifier ending in Gbp
        };
      }
    `;
    const result = scanGbpIdentifiers(source, "fixture.ts");
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].snippet).toContain("netWorthGbp");
  });

  it("fires on a local variable name ending in Gbp", () => {
    const source = `
      const rawGbp = await toBase(amount, currency, baseCurrency);
      return { baseEquivalent: rawGbp };
    `;
    const result = scanGbpIdentifiers(source, "fixture.ts");
    expect(result.matches.length).toBeGreaterThan(0);
  });

  it("fires on an interface field ending in Gbp", () => {
    const source = `
      interface Contribution { valueGbp: number | null; dayGbp: number | null; }
    `;
    const result = scanGbpIdentifiers(source, "fixture.ts");
    expect(result.matches.length).toBe(2);
  });

  it("does NOT fire on the toGbp / gbpTo helpers (allowlisted)", () => {
    const source = `
      export async function toGbp(amount: number, currency: string) {}
      export async function gbpTo(gbp: number, target: string) {}
    `;
    const result = scanGbpIdentifiers(source, "fixture.ts");
    expect(result.matches.length).toBe(0);
  });

  it("does NOT fire on the string literal \"GBP\"", () => {
    const source = `
      if (currency === "GBP") return amount;
    `;
    const result = scanGbpIdentifiers(source, "fixture.ts");
    expect(result.matches.length).toBe(0);
  });

  it("does NOT fire on a comment mentioning Gbp", () => {
    const source = `
      // Previously named gbpValue; renamed 30-Aug to baseEquivalent.
      const baseEquivalent = 42;
    `;
    const result = scanGbpIdentifiers(source, "fixture.ts");
    expect(result.matches.length).toBe(0);
  });

  // Documentation, not a bite — the case this lock CANNOT catch.
  // Kept so a future reader understands why the miscomputation
  // direction lives in enrich-investment.test.ts instead of here.
  it("(documentation) does NOT catch the miscomputation direction — that's dataflow, not naming", () => {
    // A source that emits a base-named field with a body that never
    // reads baseCurrency. A presence check for baseCurrency would be
    // satisfied by the parameter name; a dataflow tracer would prove
    // baseCurrency never reaches the returned value. This lock does
    // NEITHER, on purpose. The base-MYR behavioural regression test
    // in enrich-investment.test.ts is what catches this.
    const source = `
      export function enrichInvestment(baseCurrency: string) {
        const toRate = 1;    // baseCurrency is unused; toRate should read fx.rates[baseCurrency]
        return { baseEquivalent: 100 * toRate };
      }
    `;
    const result = scanGbpIdentifiers(source, "fixture.ts");
    expect(result.matches.length).toBe(0);
  });
});
