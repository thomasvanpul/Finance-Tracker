// Lock #16 — demo/mock/sample fabrications in production render paths.
//
// ── The two shapes this catches ────────────────────────────────────────────
//
// Shape A: a named demo/mock/sample constant, function or flag lives in a
// production file that ships to the App Store bundle. Every one of these
// found in the 26-Aug audit rendered fabricated financial values as if they
// were the user's own — DEMO_TXS (45-row Rent/Sainsbury's/Salary seed),
// DEMO_ACCOUNTS (5 UK accounts totalling £15,340), DEMO_TX_ROWS,
// DEMO_BILLS, PREVIEW_ROWS (six £ rows in the mobile ledger under a "0
// entries" header), makeDemoTxs, useMock, isDemo, isMock. The named-
// constant grep would catch all of these; camelCase widening (per the
// operator's Correction 2) also catches `demoRows`, `seedTxs`, `mockData`.
//
// Shape B: the SAME defect but hidden behind a bare numeric literal in a
// ternary-else or a nullish-coalesce fallback. The 26-Aug audit found four
// sites of this shape, all ungated and all firing on real user data:
//   analytics.tsx  incomeThisMonth > 50 ? incomeThisMonth : 3700
//   analytics.tsx  recentExpenses.length > 0 ? avg : 1500
//   analytics.tsx  recentIncome.length > 0 ? avg : 2500
//   whatif.tsx     baseExpenses > 0 ? baseExpenses : 2500
//
// A user with income under £50 this month, or with no expenses in the last
// three months, was silently getting a £3700 income floor or a £1500/mo
// burn baseline injected into their FIRE tracker. No banner, no marker,
// no name to grep on. That's the shape a regex approximation would miss;
// only an AST walk over ConditionalExpression / BinaryExpression with a
// NumericLiteral leaf catches it.
//
// ── Why AST, not regex ──────────────────────────────────────────────────────
//
// A regex on the fabricated-zero pattern is what the operator originally
// suggested for this defect class. The problem: a bare `? incomeThisMonth
// : 3700` fires no name-based check and is trivially rewritable to escape
// any text-shape check. The AST route walks ConditionalExpression nodes
// directly, reads the NumericLiteral leaf on the false branch, and lets
// us apply a zero-vs-nonzero rule that catches the £3700 / £2500 / £1500
// case cleanly. False-positive rate is much lower than the regex version
// because the AST already excludes literals in comments, in string
// content, in imports, etc.
//
// The AST spike was materially easier than initially claimed. typescript
// is already a dependency (see the typecheck script in package.json);
// ts.createSourceFile plus a small forEachChild walk is <30 lines. The
// exercise took twenty minutes to prototype; the "real project, not a
// test file" framing was wrong.
//
// ── The allowlist ──────────────────────────────────────────────────────────
//
// A scattered `// non-financial-literal` suppression comment in each
// offending page was rejected: comments are invisible in review and rot
// silently. The allowlist below lives in one central file. Each entry
// names path, line, and reason. Adding an exception is a visible edit to
// this lock — the whole point of a lock is that weakening it takes a
// diff, not a decoration.
//
// Line numbers are a snapshot. A future edit that moves an allowlisted
// literal to a different line will fail the check, at which point the
// allowlist entry gets its line updated (and a reviewer sees the drift).
// That is not a bug; that is the lock re-asserting itself.
//
// ── What this lock does NOT catch ──────────────────────────────────────────
//
// Stated up-front so the coverage isn't overclaimed:
//   • Financial fabrications built via arithmetic (`income * 1.1`,
//     `expenses + 500`). Text and AST both can't tell honest maths from
//     padding.
//   • Fabrications inside object/array literals that aren't preceded by a
//     Shape-A named-flag or a Shape-B ternary/coalesce. `{ balance:
//     1100 }` inside a function scope with no naming discipline is not
//     detectable by structure alone.
//   • Fabrications behind a function boundary: `function
//     defaultIncome() { return 3700; }` then `income = a || defaultIncome()`.
//     The literal is inside a return, not a ternary-else. Detectable in
//     principle by a broader AST rule (any ReturnStatement of a bare
//     NumericLiteral in a function whose name matches
//     /default|placeholder|seed/i), left out because it hasn't recurred.
//   • Fabrications via reassignment (`const x = compute(); if (empty)
//     x = 1500;`). Different AST shape from ConditionalExpression.
//   • Fabrications outside the SPA source tree. Scope is
//     artifacts/finance-tracker/src.
//   • Zero literals in ternary-else. `? x : 0` is the additive identity
//     and appears in hundreds of legitimate accumulator patterns. Locked
//     separately by fabricated-zero-lock.test.ts for the FX-specific
//     shape.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");
const SCAN_ROOT = join(REPO_ROOT, "artifacts", "finance-tracker", "src");

// ── Shape A · named-flag patterns ──────────────────────────────────────────
// Matches identifier declarations (const, let, var, function) whose name
// looks like a demo/mock/sample flag or factory. Both SCREAMING_CASE and
// camelCase are caught (Correction 2). Deliberately narrow to declaration
// sites: an import of MOCK_FOO from a legitimate library into production
// code would fail here, which is intended — if the import is legitimate,
// the file goes in ALLOWLIST_A with a reason.
const NAMED_FLAG_PATTERNS: RegExp[] = [
  /^(DEMO|MOCK|SAMPLE|PREVIEW|FAKE|STUB|SEED)_[A-Z0-9_]+$/,
  /^(demo|mock|sample|preview|fake|stub|seed)[A-Z][A-Za-z0-9]*$/,
  /^make(Demo|Mock|Sample|Fake|Stub|Seed)[A-Za-z0-9]*$/,
  /^(useMock|isDemo|isMock|showDemo|demoMode|isPreview|isSample|isFake)$/,
];

function namedFlagMatches(name: string): boolean {
  return NAMED_FLAG_PATTERNS.some((rx) => rx.test(name));
}

// ── Shape B · bare non-zero numeric literal in a ternary-else or ?? RHS ──
// Zero is the additive identity and appears in thousands of legitimate
// spots (`Math.max(x, 0)`, `?? 0` on accumulators). Non-zero literal in a
// ternary-else is the tell — the operator's own two worst sites were
// `? incomeThisMonth : 3700` and `? avg : 1500`. Even £1 is worth flagging;
// the allowlist absorbs anything genuinely non-financial (CSS constants,
// timeout ms, etc.) with a reviewer-facing reason.

// ── Allowlists ─────────────────────────────────────────────────────────────
// EVERY entry is a debt item and must justify itself to a reviewer. Adding
// one is a visible diff to this lock, not a comment in a page nobody
// re-reads. Line numbers are snapshots; edits that move an allowlisted
// literal fail the check until the line is corrected here.

interface AllowEntry {
  path: string;      // relative to REPO_ROOT
  line: number;      // 1-indexed, from getLineAndCharacterOfPosition
  reason: string;
}

const ALLOWLIST_A: readonly AllowEntry[] = [
  // Preview-mode UI state — theme-swatch preview, widget-carousel preview.
  // Not a data fabrication; the "preview" here is a controlled UI state
  // toggled by the user, and no financial value is invented.
  { path: "artifacts/finance-tracker/src/pages/dashboard.tsx", line: 1505, reason: "widget-carousel preview state (which widget is being hovered/previewed in the carousel picker)" },
  { path: "artifacts/finance-tracker/src/pages/dashboard.tsx", line: 1507, reason: "widget-carousel preview definition object (metadata for the previewed widget)" },
  { path: "artifacts/finance-tracker/src/pages/settings.tsx", line: 746, reason: "theme-swatch preview state (which accent-colour swatch is being hovered)" },
  { path: "artifacts/finance-tracker/src/pages/settings.tsx", line: 747, reason: "theme-swatch preview colour value (the hovered swatch's hex)" },
];

const ALLOWLIST_B: readonly AllowEntry[] = [
  // Chart-normalisation denominators — `... ? maxOfNonEmpty : 1` avoids
  // division by zero when the input is empty. Non-money literals; the `1`
  // is a mathematical placeholder that never renders as a currency figure.
  { path: "artifacts/finance-tracker/src/components/investments/derivatives-tab.tsx", line: 1488, reason: "chart normalisation denominator: payoffData empty → 1 to avoid /0 in bar height calc" },
  { path: "artifacts/finance-tracker/src/components/investments/portfolio-tables.tsx", line: 148, reason: "ratio for weighting bar; 1 = fully weighted when live price is missing (chart geometry, not currency)" },
  { path: "artifacts/finance-tracker/src/components/mobile/MobileHome.tsx", line: 554, reason: "chart normalisation: empty daily balances → 1 to avoid /0 in bar height" },
  { path: "artifacts/finance-tracker/src/components/widgets/accounts-summary.tsx", line: 133, reason: "chart max: empty accounts → 1 as normalisation baseline for bar widths" },
  { path: "artifacts/finance-tracker/src/pages/accounts.tsx", line: 544, reason: "chart max denominator: empty categorySpend → 1 to avoid /0" },
  { path: "artifacts/finance-tracker/src/pages/analytics.tsx", line: 1501, reason: "chart max denominator: empty merchants → 1 to avoid /0" },
  { path: "artifacts/finance-tracker/src/pages/analytics.tsx", line: 1570, reason: "chart max denominator: empty top8 → 1 to avoid /0" },
  { path: "artifacts/finance-tracker/src/pages/briefing.tsx", line: 427, reason: "chart max denominator: empty sorted → 1 to avoid /0" },
  { path: "artifacts/finance-tracker/src/pages/decisions.tsx", line: 236, reason: "goal-progress ratio: g.target === 0 → 1 (goal already met by default)" },
  { path: "artifacts/finance-tracker/src/pages/pension.tsx", line: 749, reason: "growth-ratio: no contributions → 1x (no growth) as neutral baseline" },
  { path: "artifacts/finance-tracker/src/pages/year-review.tsx", line: 1260, reason: "chart max denominator: empty topCats → 1 to avoid /0" },

  // Percentage caps — `... ? Math.min(100, real) : 100` returns 100 as the
  // "already at cap" branch. Non-money literal (percentage points).
  { path: "artifacts/finance-tracker/src/components/widgets/compact-tiles.tsx", line: 963, reason: "milestone progress cap: no next milestone → 100% (all reached)" },
  { path: "artifacts/finance-tracker/src/lib/learn-xp.ts", line: 28, reason: "XP progress cap: no next tier → 100% (at cap)" },
  { path: "artifacts/finance-tracker/src/pages/analytics-helpers.ts", line: 36, reason: "pct-change fallback: curr === 0 branch returns 0; else 100 (∞ growth from 0 baseline)" },
  { path: "artifacts/finance-tracker/src/pages/fire.tsx", line: 375, reason: "coast-FIRE progress cap: coastNeeded <= 0 → 100% (already coasted)" },
  // pension.tsx:285 and :389 were the "100% bar when target undefined"
  // sites — a fabricated goal-completion signal for a user who set no
  // target. Fixed 26-Aug: targetMonthlyIncome nullable end-to-end
  // (PensionInputs type + loadPension), KpiBar KPI cell shows "NO TARGET"
  // in muted colour, PensionHealthBlock short-circuits to a "Target not
  // set" empty state. Root cause (fabricated £2,500/mo defaults at
  // pension.tsx :91 and :103) removed at the source rather than
  // caught downstream.

  // UI dimensions, font sizes, opacities, layout constants — pixel/percent
  // values in JSX-style variable initializers. Non-currency.
  { path: "artifacts/finance-tracker/src/components/ai-wanderer.tsx", line: 1003, reason: "sidebar-width fallback: 212px, matches the default rail width in layout.tsx" },
  { path: "artifacts/finance-tracker/src/components/currency-mark.tsx", line: 41, reason: "SVG font-size in px based on character count (18 or 22)" },
  { path: "artifacts/finance-tracker/src/components/layout.tsx", line: 1239, reason: "sidebar-width restore default: 212px when localStorage value is absent" },
  { path: "artifacts/finance-tracker/src/components/matrix-rain.tsx", line: 91, reason: "matrix-rain glyph scale (1.4 or 1) — animation randomisation, not currency" },
  { path: "artifacts/finance-tracker/src/components/page-transition.tsx", line: 59, reason: "CSS opacity for fade transition (0 or 1)" },
  { path: "artifacts/finance-tracker/src/components/primitives/block-field.tsx", line: 161, reason: "grid-column count for hero/no-hero layout" },
  { path: "artifacts/finance-tracker/src/components/primitives/block-field.tsx", line: 162, reason: "grid-row count for hero/no-hero layout" },
  { path: "artifacts/finance-tracker/src/components/theme-effects.tsx", line: 960, reason: "line stroke width (2.5px thick or 1.2px thin)" },
  { path: "artifacts/finance-tracker/src/components/widgets/budget-tracker.tsx", line: 133, reason: "grid column count: expanded=3, collapsed=2" },
  { path: "artifacts/finance-tracker/src/pages/recurring.tsx", line: 181, reason: "grid column count for the KPI strip: phone=2, desktop=4 — drives the borderRight column rules, not a figure" },
  { path: "artifacts/finance-tracker/src/pages/reports.tsx", line: 1325, reason: "grid column count for the KPI strip: phone=2, desktop=5 — drives the borderRight column rules, not a figure" },
  { path: "artifacts/finance-tracker/src/components/widgets/cash-flow.tsx", line: 142, reason: "chart height in px (220 expanded or 150 collapsed)" },
  { path: "artifacts/finance-tracker/src/components/widgets/recent-transactions.tsx", line: 131, reason: "row cap: 30 expanded or 15 collapsed" },
  { path: "artifacts/finance-tracker/src/components/widgets/top-merchants.tsx", line: 131, reason: "row cap: 8 expanded or 5 collapsed" },
  { path: "artifacts/finance-tracker/src/pages/accounts.tsx", line: 1560, reason: "border thickness (2px hi-value, 4px normal)" },
  { path: "artifacts/finance-tracker/src/pages/analytics.tsx", line: 1240, reason: "chart bar width in px (38 mobile / 44 desktop)" },
  { path: "artifacts/finance-tracker/src/pages/analytics.tsx", line: 1241, reason: "chart bar height in px (34 mobile / 40 desktop)" },
  { path: "artifacts/finance-tracker/src/pages/investments.tsx", line: 437, reason: "popup position fallback: no anchor rect → 100px default" },
  { path: "artifacts/finance-tracker/src/pages/investments.tsx", line: 441, reason: "popup position fallback: no anchor rect → 100px default" },
  { path: "artifacts/finance-tracker/src/pages/reports.tsx", line: 795, reason: "chart bar min height in px (4px)" },
  { path: "artifacts/finance-tracker/src/pages/upcoming.tsx", line: 508, reason: "sort comparator: overdue → 0, not-overdue → 1 (sort ordinal, not money)" },
  { path: "artifacts/finance-tracker/src/pages/upcoming.tsx", line: 509, reason: "sort comparator: overdue → 0, not-overdue → 1 (sort ordinal, not money)" },

  // Formatting / config defaults — decimal counts, period lengths.
  { path: "artifacts/finance-tracker/src/components/mobile/mobile-format.ts", line: 10, reason: "default decimals count (2) for nfmt when unspecified" },
  { path: "artifacts/finance-tracker/src/components/mobile/MobileHome.tsx", line: 44, reason: "default decimals count (2) for local nfmt fallback" },
  { path: "artifacts/finance-tracker/src/pages/cashflow.tsx", line: 236, reason: "SUB_FREQ_DAYS fallback: unrecognised frequency → 30 days (monthly assumption; refactor to strict enum tracked separately)" },

  // Streaks, thresholds — non-money integers.
  { path: "artifacts/finance-tracker/src/lib/ix-engine.ts", line: 215, reason: "streak counter: not-yesterday → reset to 1 (day count, not currency)" },
  { path: "artifacts/finance-tracker/src/pages/health-score.tsx", line: 749, reason: "savings-rate percentile threshold selector (10% or 20%), not a currency value" },

  // Three earlier entries here (markets-tab.tsx:1374 8% revenue growth,
  // owing.tsx:225 + :429 20% APR default) were the defect, not exceptions.
  // Allowlisting them was resolving a failing check by weakening it. Fixed:
  //   • markets-tab.tsx now renders DCF as "—" plus "growth data unavailable"
  //     when the provider omits revenueGrowth. No fabricated 8% assumption.
  //   • owing.tsx StrategyTab filters strategyDebts to APR-set debts only,
  //     surfaces APR-less debts in a separate "APR needed" panel with an
  //     empty input and "no interest cost" placeholder. Payoff strategy
  //     never runs against an invented rate.

  // ── Pension defaults, surfaced when Shape B widened to non-style PropertyAssignments (26-Aug) ──
  //
  // pension.tsx:92 currentAge — REMOVED. Fixed at source: currentAge is
  // nullable, projection short-circuits to an "enter your current age"
  // empty state until entered. Assuming 30 was inventing a personal
  // fact and driving every projected number off it.
  //
  // Documented external fact — legitimate default. 67 is the UK State
  // Pension age (Pensions Act 2014 · gov.uk/state-pension-age), not a
  // number invented about this specific user. Users can review the
  // input and change it; the "at age 67" caption on the Projected Pot
  // cell means the assumption is disclosed at the point the projection
  // renders. Different class from targetMonthlyIncome / currentAge,
  // both of which invented personal state.
  { path: "artifacts/finance-tracker/src/pages/pension.tsx", line: 107, reason: "retirementAge fresh-install default (67 = UK State Pension age, Pensions Act 2014). Documented external fact, not an invented personal number. Disclosed at render as 'at age 67 · in Nyr' on the Projected Pot cell." },
  //
  // growthRate default 7% — G11 resolved via disclosure contract.
  // A conventional pension-model assumption is legitimate IF the user
  // can see the value at the render point and change it. Enforced in
  // three places, any of which failing means the pill silently
  // becomes wrong: the "assumes N%/yr growth" clickable pill in the
  // Projected Pot caption (KpiBar), the "Assumes N%/yr growth to
  // retirement" footer in PensionHealthBlock, and the onFocusGrowthRate
  // handler that scrolls + focuses the growth-rate input. All three
  // are locked by pension-growth-rate-disclosure.test.ts. If any is
  // removed, that test fails before this allowlist entry can silently
  // become a lie about what the code does.
  { path: "artifacts/finance-tracker/src/pages/pension.tsx", line: 108, reason: "growthRate default 7% — legitimate conventional model assumption, disclosed at the render point via the 'assumes N%/yr growth' clickable pill on the Projected Pot caption (KpiBar) and the health-block footer, with a click handler that scrolls + focuses the input. Contract locked by pension-growth-rate-disclosure.test.ts." },
];

// ── Scanner ────────────────────────────────────────────────────────────────

interface Defect {
  path: string;      // relative to REPO_ROOT
  line: number;      // 1-indexed
  shape: "A" | "B";
  detail: string;    // human-readable, includes matched text
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "generated" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (
      st.isFile() &&
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".test.tsx") &&
      !full.endsWith(".spec.ts") &&
      !full.endsWith(".spec.tsx") &&
      !full.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

// Style-shaped property keys — pension.tsx:91 was invisible to Shape B
// because the earlier universal PropertyAssignment exclusion (to keep
// JSX styling noise out) also hid every fabricated financial default
// living in a defaults/config/initial-state object. Defaults naturally
// live in object literals, so the exclusion had to narrow to what is
// actually CSS/layout, not "any property assignment".
//
// The pattern here is: exact-name match for well-known one-word style
// props, plus a prefix match for the boring compound families (padding*,
// margin*, border*, font*, text*, min*/max* dimensions, stroke*, dash*,
// offset*). A property whose name doesn't hit this vocabulary is
// treated as a value slot — the same as any variable initializer.
const STYLE_KEY_EXACT = new Set<string>([
  "opacity", "top", "left", "right", "bottom", "gap", "zIndex",
  "transform", "transformOrigin", "transition", "animation", "filter",
  "position", "display", "overflow", "overflowX", "overflowY", "visibility",
  "flex", "flexGrow", "flexShrink", "flexBasis", "flexWrap", "flexDirection",
  "gridColumn", "gridRow", "gridArea", "columnGap", "rowGap",
  "alignItems", "alignSelf", "alignContent", "justifyContent", "justifyItems", "justifySelf",
  "rotate", "scale", "skew", "translate",
  "size", "radius", "thickness",
  "lineHeight", "letterSpacing", "wordSpacing",
  "duration", "delay", "iterations", "cursor",
  // Primitive component shorthand props (see components/primitives/*):
  "pt", "pb", "pl", "pr", "py", "px", "mt", "mb", "ml", "mr", "my", "mx",
  "w", "h", "wrap", "align", "justify", "grow",
]);

const STYLE_KEY_PREFIX = /^(padding|margin|border|font|text|min|max|stroke|dash|offset|inset|outline|scroll)/;

function isStyleKey(name: string): boolean {
  if (STYLE_KEY_EXACT.has(name)) return true;
  return STYLE_KEY_PREFIX.test(name);
}

// True when `node` sits directly (walking up through Parenthesized /
// As / Non-null / Satisfies expressions) at a variable initializer, an
// assignment RHS, a returned/arrow-body position, or a PropertyAssignment
// whose key is NOT a JSX/CSS style key — the "value-slot" shapes where
// a fabricated literal is what a user reads on screen.
function isInValueSlot(node: ts.Node): boolean {
  let current = node.parent as ts.Node | undefined;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current))
  ) {
    current = current.parent;
  }
  if (!current) return false;
  if (ts.isVariableDeclaration(current) && current.initializer === (node.parent === current ? node : current.initializer)) {
    return true;
  }
  if (ts.isReturnStatement(current)) return true;
  if (ts.isArrowFunction(current) && current.body === (node.parent === current ? node : current.body)) return true;
  if (
    ts.isBinaryExpression(current) &&
    current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    current.right === (node.parent === current ? node : current.right)
  ) {
    return true;
  }
  // PropertyAssignment — narrow exclusion (only skip when the property
  // name is a style/layout key, or the containing object is inside a
  // JSX attribute). Everything else — defaults objects, config objects,
  // initial-state seeds — is a value slot.
  if (ts.isPropertyAssignment(current)) {
    const keyName = ts.isIdentifier(current.name) ? current.name.text
      : ts.isStringLiteral(current.name) ? current.name.text
      : null;
    if (keyName && isStyleKey(keyName)) return false;
    // Walk further up to see if we're inside a JSX attribute value —
    // `<div style={{ myKey: cond ? … : 3700 }}>`. That's still styling
    // even if the individual key isn't in the vocabulary.
    let up: ts.Node | undefined = current.parent;
    while (up) {
      if (ts.isJsxAttribute(up) || ts.isJsxExpression(up) || ts.isJsxSpreadAttribute(up)) return false;
      // Object literal deeply nested inside a JSX attribute counts too.
      // Stop climbing at Statement / Block boundaries — no JSX beyond.
      if (ts.isStatement(up) || ts.isBlock(up) || ts.isSourceFile(up)) break;
      up = up.parent;
    }
    return true;
  }
  return false;
}

function scanFile(filePath: string): Defect[] {
  const text = readFileSync(filePath, "utf-8");
  const rel = relative(REPO_ROOT, filePath);
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.ES2020, /*setParentNodes*/ true, filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const defects: Defect[] = [];

  function lineOf(node: ts.Node): number {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return line + 1;
  }

  function visit(node: ts.Node) {
    // Shape A · named declaration
    if ((ts.isVariableDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      if (namedFlagMatches(name)) {
        defects.push({
          path: rel,
          line: lineOf(node.name),
          shape: "A",
          detail: `named-flag declaration: ${name}`,
        });
      }
    }

    // Shape B · ternary-else / nullish-coalesce with a non-zero NumericLiteral,
    // BUT only when the whole conditional/coalesce is the initializer of a
    // variable declaration, the RHS of an assignment, the returned expression,
    // or the body of an arrow function. That is the shape of the four A4/A14a
    // sites (const income = ... ? ... : 3700; return ... ? ... : 1500).
    //
    // This filter deliberately excludes:
    //   • Ternaries inside JSX props (`style={{ opacity: hover ? 0.5 : 1 }}`)
    //     — the parent is a PropertyAssignment / JsxAttribute, not any of the
    //     four value-slot shapes above.
    //   • Ternaries as function-call arguments (`useState(cond ? a : 100)`)
    //     — the parent is a CallExpression argument list.
    //   • Ternaries inside object-literal properties passed anywhere.
    //
    // The four operator-flagged worst sites all match: they're `const X = …`
    // assignments in either a top-level useMemo body or a function scope.
    // Regenerated JSX-heavy files (transactions.tsx, upcoming.tsx, split.tsx)
    // stop firing entirely once this filter is applied.
    if (
      (ts.isConditionalExpression(node) && ts.isNumericLiteral(node.whenFalse)) ||
      (ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
        ts.isNumericLiteral(node.right))
    ) {
      const literal = ts.isConditionalExpression(node) ? node.whenFalse as ts.NumericLiteral : node.right as ts.NumericLiteral;
      const val = Number(literal.text);
      if (val !== 0 && isInValueSlot(node)) {
        const kind = ts.isConditionalExpression(node) ? "ternary-else" : "nullish-coalesce";
        defects.push({
          path: rel,
          line: lineOf(literal),
          shape: "B",
          detail: `${kind} literal ${val} in: ${node.getText(sf).replace(/\s+/g, " ").slice(0, 120)}`,
        });
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sf);
  return defects;
}

function scanAll(): Defect[] {
  const files = walk(SCAN_ROOT);
  const out: Defect[] = [];
  for (const f of files) out.push(...scanFile(f));
  return out;
}

function isAllowed(defect: Defect, list: readonly AllowEntry[]): boolean {
  return list.some((e) => e.path === defect.path && e.line === defect.line);
}

function formatDefect(d: Defect): string {
  return `  ${d.path}:${d.line} [${d.shape}] ${d.detail}`;
}

// ── The tests ──────────────────────────────────────────────────────────────

// AST source-scanner. Walks the whole src/ tree twice (Shape A named
// declarations + Shape B ternary-else literals). Same flake shape as
// Lock #17 — vitest's 5s default is a unit-test ceiling. 15s gives
// 3× headroom against CPU contention. See api-fetch.lock.test.ts.
describe("demo-fabrication lock (#16)", { timeout: 15_000 }, () => {
  const defects = scanAll();

  it("Shape A · no named DEMO/MOCK/SAMPLE constants or flags in src/", () => {
    const hits = defects
      .filter((d) => d.shape === "A")
      .filter((d) => !isAllowed(d, ALLOWLIST_A))
      .sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)));
    if (hits.length === 0) return;
    throw new Error(
      `Lock #16 · Shape A · found ${hits.length} named demo/mock/sample declaration(s) in production paths:\n` +
      hits.map(formatDefect).join("\n") +
      `\n\nPattern: identifier declared as \`DEMO_*\`, \`MOCK_*\`, \`SAMPLE_*\`, \`PREVIEW_*\`, \`FAKE_*\`, \`STUB_*\`, \`SEED_*\` (SCREAMING_CASE) or camelCase equivalents (\`demoRows\`, \`mockData\`, \`sampleTxs\`, \`makeDemoTxs\`), or flag/gate names \`useMock\`, \`isDemo\`, \`isMock\`, \`showDemo\`, \`demoMode\`.\n\n` +
      `Every previous instance of this pattern rendered fabricated financial values as if they were the user's own (DEMO_TXS, DEMO_ACCOUNTS, PREVIEW_ROWS, makeDemoTxs).\n\n` +
      `Two options:\n` +
      `  1. Fix it. Delete the constant and replace with a real empty state (see docs/RETENTION.md · panel chrome + one-sentence not-enough-data message, never a fabricated £N).\n` +
      `  2. If the declaration is genuinely non-financial (a test fixture shipped inside src/ for a legitimate reason), add it to ALLOWLIST_A above with a reviewer-facing reason.`
    );
  });

  it("Shape B · no non-zero numeric literal in a ternary-else or nullish-coalesce fallback", () => {
    const hits = defects
      .filter((d) => d.shape === "B")
      .filter((d) => !isAllowed(d, ALLOWLIST_B))
      .sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)));
    if (hits.length === 0) return;
    throw new Error(
      `Lock #16 · Shape B · found ${hits.length} non-zero numeric-literal fallback(s) in production paths:\n` +
      hits.map(formatDefect).join("\n") +
      `\n\nPattern: an expression of the form \`<cond> ? <expr> : <NUMBER>\` where NUMBER != 0, or \`<expr> ?? <NUMBER>\` where NUMBER != 0. This is the shape of the ungated silent fallbacks found on 26-Aug (analytics.tsx :2241 \`? incomeThisMonth : 3700\`, :3350 \`? avg : 1500\`, :3354 \`? avg : 2500\`, whatif.tsx :636 \`? baseExpenses : 2500\`), each firing on real user data with no marker.\n\n` +
      `Two options:\n` +
      `  1. Fix it. Replace the fabricated fallback with an honest path — return \`null\` (see formatBaseMoney in lib/utils.ts), gate the render on data presence, or short-circuit the panel to a not-enough-data empty state.\n` +
      `  2. If the literal is a legitimate non-financial constant (CSS dimension, timeout ms, chart size, form-input seed that is user-editable and clearly labelled), add it to ALLOWLIST_B above with reviewer-facing reason including the specific line context.`
    );
  });

  it("allowlist entries all still match a real defect (baseline is not stale)", () => {
    const stale: AllowEntry[] = [];
    for (const e of [...ALLOWLIST_A, ...ALLOWLIST_B]) {
      const stillPresent = defects.some((d) => d.path === e.path && d.line === e.line);
      if (!stillPresent) stale.push(e);
    }
    if (stale.length === 0) return;
    throw new Error(
      `Lock #16 · Stale allowlist entries — the underlying defect is gone. Remove:\n` +
      stale.map((e) => `  ${e.path}:${e.line} — ${e.reason}`).join("\n") +
      `\n\nEvery removal here is real progress. The allowlist should shrink over time.`
    );
  });
});
