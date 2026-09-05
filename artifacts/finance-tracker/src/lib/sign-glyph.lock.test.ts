// Lock #19 — a sign glyph prefixed to a value the formatter has already signed.
//
// ── The defect ──────────────────────────────────────────────────────────────
//
// formatMoney / formatBaseMoney (lib/utils.ts) return a SIGNED string:
// formatBaseMoney(-40) is "-£40.00". Ten sites (fixed in 0857f1e) put their
// own glyph in front of that string — `-${formatBaseMoney(x)}`,
// `{isIncome ? "+" : "−"}{formatBaseMoney(x)}` — so a negative value
// rendered as "-−£40.00" or "+-£40.00". The rule from that commit: never
// prefix a sign glyph to a value the formatter has already signed. Either
// the argument is a magnitude (Math.abs) and the caller owns the sign, or
// the formatter owns the sign and the caller adds nothing but an optional
// "+" for the non-negative branch.
//
// ── What this lock checks ───────────────────────────────────────────────────
//
// For every call to formatMoney / formatBaseMoney, find the text that will
// render IMMEDIATELY before it, through three syntactic shapes:
//
//   A  template literal   `-${formatBaseMoney(x)}`  ·  `${sign}${formatBaseMoney(x)}`
//   B  JSX siblings       {"−"}{formatBaseMoney(x)}  ·  −{formatBaseMoney(x)}
//   C  string concat      "↔" + formatBaseMoney(x)
//
// The preceding text is classified into the set of glyphs it can produce:
// a string literal ending in - − + ↔ (trailing spaces ignored), a
// conditional whose branches are such literals or "", or an identifier
// named like a sign (`sign`, `glyph`, `prefix`, `arrow`) resolved to its
// nearest same-file `const` initialiser. An unresolvable sign-named
// identifier counts as a glyph — the name says what it is.
//
// A site is a defect when the glyph set contains any of - − ↔, or an
// UNCONDITIONAL "+", AND the formatter's first argument is not a
// magnitude — i.e. it contains no Math.abs( call, directly or through the
// nearest same-file `const` initialiser of an identifier argument.
//
// The one shape that is deliberately NOT a defect: `x >= 0 ? "+" : ""`
// before a signed formatter. The formatter's own minus survives in the
// negative branch and the caller only adds the plus. That shape is
// widespread (~50 sites) and correct.
//
// ── Precision ───────────────────────────────────────────────────────────────
//
// Text that is not a glyph (labels, "≈", "£") is ignored. Values that are
// magnitudes by construction but carry no Math.abs are reported — the fix
// is to make the invariant visible at the call site (wrap in Math.abs),
// not to allowlist. The allowlist below is for the cases where that is
// wrong, each with a reason; a third test keeps it from going stale.
//
// See also Lock #16 (demo-fabrication) for the AST-walk pattern.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");
const SCAN_ROOT = join(REPO_ROOT, "artifacts", "finance-tracker", "src");

const FORMATTERS = new Set(["formatMoney", "formatBaseMoney"]);
const GLYPHS = ["-", "−", "+", "↔"] as const;
const SIGN_IDENT = /^(sign|glyph|prefix|arrow|signGlyph|signPrefix|sgn)$/;

interface AllowEntry { path: string; line: number; reason: string }

// path relative to REPO_ROOT; line from the formatter call's position.
const ALLOWLIST: AllowEntry[] = [];

interface Defect { path: string; line: number; shape: "A" | "B" | "C"; detail: string }

// ── file walk ───────────────────────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "generated" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(name) || name.endsWith(".d.ts")) continue;
    out.push(full);
  }
  return out;
}

// ── glyph classification ────────────────────────────────────────────────────

// Returns the set of glyphs the expression can render, "" for an empty
// branch, or null when the expression is not sign-like at all.
function glyphsOf(expr: ts.Expression, sf: ts.SourceFile): Set<string> | null {
  if (ts.isParenthesizedExpression(expr)) return glyphsOf(expr.expression, sf);
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
    return glyphsOfText(expr.text);
  }
  if (ts.isConditionalExpression(expr)) {
    const a = glyphsOf(expr.whenTrue, sf);
    const b = glyphsOf(expr.whenFalse, sf);
    if (a == null || b == null) return null;
    return new Set([...a, ...b]);
  }
  if (ts.isIdentifier(expr) && SIGN_IDENT.test(expr.text)) {
    const init = resolveConstInitializer(expr, sf);
    if (init == null) return new Set(["?"]);
    return glyphsOf(init, sf) ?? new Set(["?"]);
  }
  return null;
}

function glyphsOfText(text: string): Set<string> | null {
  const t = text.replace(/\s+$/, "");
  if (t === "") return new Set([""]);
  const last = t[t.length - 1];
  return (GLYPHS as readonly string[]).includes(last) ? new Set([last]) : null;
}

// Nearest preceding `const <name> = <init>` in the same file. One level —
// enough for `const sign = x < 0 ? "−" : "+"` and `const abs = Math.abs(x)`.
function resolveConstInitializer(id: ts.Identifier, sf: ts.SourceFile): ts.Expression | null {
  let best: ts.VariableDeclaration | null = null;
  const visit = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === id.text
        && n.initializer && n.pos < id.pos && (best == null || n.pos > best.pos)) {
      best = n;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return best == null ? null : (best as ts.VariableDeclaration).initializer ?? null;
}

// ── magnitude check on the formatter argument ───────────────────────────────

function containsMathAbs(n: ts.Node): boolean {
  if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
      && ts.isIdentifier(n.expression.expression) && n.expression.expression.text === "Math"
      && n.expression.name.text === "abs") return true;
  return ts.forEachChild(n, containsMathAbs) ?? false;
}

function isMagnitudeArg(arg: ts.Expression | undefined, sf: ts.SourceFile): boolean {
  if (!arg) return false;
  if (containsMathAbs(arg)) return true;
  if (ts.isIdentifier(arg)) {
    const init = resolveConstInitializer(arg, sf);
    return init != null && containsMathAbs(init);
  }
  return false;
}

// ── preceding-text discovery ────────────────────────────────────────────────

interface Preceding { shape: "A" | "B" | "C"; glyphs: Set<string>; text: string }

function precedingGlyphs(call: ts.CallExpression, sf: ts.SourceFile): Preceding | null {
  const parent = call.parent;

  // A · template literal span
  if (ts.isTemplateSpan(parent) && parent.expression === call) {
    const tpl = parent.parent as ts.TemplateExpression;
    const i = tpl.templateSpans.indexOf(parent);
    const text = i === 0 ? tpl.head.text : tpl.templateSpans[i - 1].literal.text;
    const lit = glyphsOfText(text);
    if (lit != null && !lit.has("")) return { shape: "A", glyphs: lit, text: JSON.stringify(text) };
    if (text.trim() === "" && i > 0) {
      const prev = tpl.templateSpans[i - 1].expression;
      const g = glyphsOf(prev, sf);
      if (g) return { shape: "A", glyphs: g, text: prev.getText(sf) };
    }
    return null;
  }

  // B · JSX sibling
  if (ts.isJsxExpression(parent) && parent.expression === call) {
    const container = parent.parent;
    if (!ts.isJsxElement(container) && !ts.isJsxFragment(container)) return null;
    const kids = container.children;
    let i = kids.indexOf(parent) - 1;
    while (i >= 0 && ts.isJsxText(kids[i]) && kids[i].getText(sf).trim() === "") i--;
    if (i < 0) return null;
    const prev = kids[i];
    if (ts.isJsxText(prev)) {
      const g = glyphsOfText(prev.getText(sf));
      if (g && !g.has("")) return { shape: "B", glyphs: g, text: JSON.stringify(prev.getText(sf).trim()) };
      return null;
    }
    if (ts.isJsxExpression(prev) && prev.expression) {
      const g = glyphsOf(prev.expression, sf);
      if (g) return { shape: "B", glyphs: g, text: prev.expression.getText(sf) };
    }
    return null;
  }

  // C · string concatenation
  if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.PlusToken
      && parent.right === call) {
    let left: ts.Expression = parent.left;
    while (ts.isParenthesizedExpression(left)) left = left.expression;
    if (ts.isBinaryExpression(left) && left.operatorToken.kind === ts.SyntaxKind.PlusToken) left = left.right;
    const g = glyphsOf(left, sf);
    if (g) return { shape: "C", glyphs: g, text: left.getText(sf) };
    return null;
  }

  return null;
}

// The safe shape: only "+" and "" — the formatter's own minus survives.
function isSafeGlyphSet(g: Set<string>): boolean {
  return [...g].every((x) => x === "+" || x === "") && g.has("");
}

// ── scanner ─────────────────────────────────────────────────────────────────

export function scanSource(source: string, fileName: string, pathForReport: string): Defect[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const defects: Defect[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && FORMATTERS.has(node.expression.text)) {
      const pre = precedingGlyphs(node, sf);
      if (pre && !isSafeGlyphSet(pre.glyphs) && !isMagnitudeArg(node.arguments[0], sf)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        defects.push({
          path: pathForReport,
          line: line + 1,
          shape: pre.shape,
          detail: `${pre.text} precedes ${node.expression.text}(${node.arguments[0]?.getText(sf) ?? ""}) — glyphs {${[...pre.glyphs].map((g) => JSON.stringify(g)).join(",")}}, argument is not a magnitude`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return defects;
}

function scanAll(): Defect[] {
  const out: Defect[] = [];
  for (const file of walk(SCAN_ROOT)) {
    out.push(...scanSource(readFileSync(file, "utf8"), file, relative(REPO_ROOT, file)));
  }
  return out;
}

function isAllowed(d: Defect, list: AllowEntry[]): boolean {
  return list.some((a) => a.path === d.path && a.line === d.line);
}

function formatDefect(d: Defect): string {
  return `  ${d.path}:${d.line}  [${d.shape}]  ${d.detail}`;
}

// ── tests ───────────────────────────────────────────────────────────────────

describe("sign-glyph lock (#19)", { timeout: 15_000 }, () => {
  it("no sign glyph precedes a formatMoney / formatBaseMoney call whose argument is not a magnitude", () => {
    const defects = scanAll().filter((d) => !isAllowed(d, ALLOWLIST));
    expect(
      defects,
      `${defects.length} glyph-before-signed-formatter site(s):\n${defects.map(formatDefect).join("\n")}\n` +
      `Fix: pass Math.abs(...) so the caller owns the sign, or use the safe shape x >= 0 ? "+" : "" and let the formatter sign it.`,
    ).toEqual([]);
  });

  it("allowlist entries all still match a real defect (baseline is not stale)", () => {
    const defects = scanAll();
    const stale = ALLOWLIST.filter((a) => !defects.some((d) => d.path === a.path && d.line === a.line));
    expect(stale, `stale allowlist entries:\n${stale.map((a) => `  ${a.path}:${a.line}`).join("\n")}`).toEqual([]);
  });

  // The detector bites — each case is the minimal source for one shape.
  const cases: Array<[string, string, number]> = [
    ["A · literal minus in template",        "const s = `-${formatBaseMoney(x)}`;", 1],
    ["A · literal minus, magnitude arg",     "const s = `-${formatBaseMoney(Math.abs(x))}`;", 0],
    ["A · unconditional plus in template",   "const s = `+${formatBaseMoney(x)}`;", 1],
    ["A · conditional sign via identifier",  "const sign = x < 0 ? \"−\" : \"+\"; const s = `${sign}${formatBaseMoney(x)}`;", 1],
    ["A · conditional sign, magnitude ident", "const sign = x < 0 ? \"−\" : \"+\"; const abs = Math.abs(x); const s = `${sign}${formatBaseMoney(abs)}`;", 0],
    ["A · unresolved sign identifier",       "const s = `${sign}${formatBaseMoney(x)}`;", 1],
    ["A · safe plus-or-empty",               "const s = `${x >= 0 ? \"+\" : \"\"}${formatBaseMoney(x)}`;", 0],
    ["A · label text is not a glyph",        "const s = `Total ${formatBaseMoney(x)}`;", 0],
    ["B · JSX expression minus",             "const e = <span>{\"−\"}{formatBaseMoney(x)}</span>;", 1],
    ["B · JSX text minus",                   "const e = <span>−{formatBaseMoney(x)}</span>;", 1],
    ["B · JSX conditional with minus branch", "const e = <span>{isIncome ? \"+\" : \"−\"}{formatBaseMoney(x)}</span>;", 1],
    ["B · JSX safe shape",                   "const e = <span>{x >= 0 ? \"+\" : \"\"}{formatBaseMoney(x)}</span>;", 0],
    ["B · JSX minus, magnitude arg",         "const e = <span>{\"−\"}{formatBaseMoney(Math.abs(x))}</span>;", 0],
    ["B · JSX minus-or-empty (minus doubles)", "const e = <span>{x < 0 ? \"−\" : \"\"}{formatBaseMoney(x)}</span>;", 1],
    ["C · concat arrow",                     "const s = \"↔\" + formatBaseMoney(x);", 1],
    ["C · concat arrow, magnitude arg",      "const s = \"↔ \" + formatBaseMoney(Math.abs(x));", 0],
    ["C · chained concat, glyph last",       "const s = label + \" \" + \"-\" + formatBaseMoney(x);", 1],
    ["formatMoney too",                      "const s = `-${formatMoney(x, cur)}`;", 1],
  ];
  for (const [name, src, expected] of cases) {
    it(`bites · ${name}`, () => {
      const defects = scanSource(`declare const x: number; declare const cur: string; declare const isIncome: boolean; declare const label: string;\n${src}`, "case.tsx", "case.tsx");
      expect(defects.length, defects.map(formatDefect).join("\n")).toBe(expected);
    });
  }
});
