// Source-level lock: no literal hex colour in a style position.
//
// The arctic audit found that every desktop chart page independently
// hardcoded the same GitHub-dark greys on Recharts axis ticks, a
// tooltip painted the wrong theme's palette, and a status pill
// carried a #F59E0B that failed WCAG on arctic. Same shape as the
// pnum-invariant and no-emoji locks: a mechanical grep catches what
// a reader misses under time pressure.
//
// Rule: no string literal matching /#[0-9a-fA-F]{3,8}/ may appear
// as a CSS colour value in a style position — inline style objects,
// object-literal palettes, or template literals bound to style
// properties. Colours must route through a --ft-* token so themes
// can override them.
//
// Excluded, deliberately:
//   - Theme, persona, and skin DEFINITION files. Those files are
//     where the identity hexes legitimately live; every other caller
//     references them by token.
//   - Test files (they're not shipped UI).
//
// Escapes if you genuinely need a literal:
//   - Add the value to :root / [data-theme="…"] in index.css as
//     --ft-<name> and use var(--ft-<name>) at the call site.
//   - For an identity slot, use --ft-id-N (see the ramp in
//     index.css) rather than adding a bespoke token.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = join(dirname(__filename), "..");
const REPO_ROOT = join(SRC_DIR, "..");

// Files where literal hex is the point (theme + identity definitions,
// persona-specific skin colours that intentionally override the token
// system to paint a distinctive surface). Match by suffix so nested
// paths work. Keep this tight — every addition weakens the lock.
const EXEMPT_SUFFIXES: readonly string[] = [
  "/contexts/theme-context.tsx",
  "/components/theme-effects.tsx",
  "/components/mario-skin.tsx",
  "/components/premium-skins.tsx",
  "/components/ai-wanderer.tsx",
  "/components/easter-eggs.tsx",
  "/components/ai-agent.tsx",
  "/lib/persona.ts",
  "/lib/bot-skins.ts",
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "generated") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile()) out.push(full);
  }
  return out;
}

const files = walk(SRC_DIR).filter((f) =>
  (f.endsWith(".tsx") || f.endsWith(".ts")) &&
  !f.endsWith(".test.ts") &&
  !f.endsWith(".test.tsx") &&
  // The lock file itself carries the forbidden patterns in comments
  // and inside the synthetic self-test payload; skip it.
  !f.endsWith("no-style-hex.test.ts") &&
  !EXEMPT_SUFFIXES.some((suffix) => f.endsWith(suffix)),
);

// Style-position property names. Anything on this list, followed by
// a colon and a string containing a hex literal, is a violation.
// The border shorthand (`border: "1px solid #abc"`) is covered because
// the hex sits inside the string value — we scan the whole string.
const STYLE_PROPS = [
  "color",
  "background",
  "backgroundColor",
  "backgroundImage",
  "fill",
  "stroke",
  "border",
  "borderColor",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outline",
  "outlineColor",
  "boxShadow",
  "textDecoration",
  "textDecorationColor",
  "caretColor",
  "columnRuleColor",
];

// One combined regex.
//   \b(prop)\s*:\s* opens the assignment
//   ["'`]           opens a string of any kind
//   [^"'`]*         non-quote body (avoids swallowing following code)
//   #[0-9a-fA-F]{3,8}  the hex literal we're catching
//   [^"'`]*         rest of string
//   ["'`]           closing quote
// Multi-line strings (backticks) that span newlines are still one
// regex match because [^"'`] can include \n.
const HEX_RE = new RegExp(
  `\\b(${STYLE_PROPS.join("|")})\\s*:\\s*["'\`][^"'\`]*#[0-9a-fA-F]{3,8}[^"'\`]*["'\`]`,
  "g",
);

interface Violation {
  file: string;
  line: number;
  prop: string;
  snippet: string;
}

// Patterns whose hex is deliberately theme-independent and safe.
//   #fff / #ffffff: pure white — audit explicitly recorded as correct
//     for the white-on-coloured-button pattern (delete buttons).
//   #000 / #000000: pure black — same category.
//   var(--ft-…, #hex): CSS custom-property fallback. The token is the
//     source of truth; the hex only renders if the token is undefined.
const SAFE_PATTERNS: readonly RegExp[] = [
  /#(?:fff(?:fff)?|FFF(?:FFF)?)\b/,
  /#(?:000(?:000)?)\b/,
  /var\(\s*--[a-zA-Z0-9-]+\s*,\s*#[0-9a-fA-F]{3,8}\s*\)/,
];

function isSafe(snippet: string): boolean {
  return SAFE_PATTERNS.some((re) => re.test(snippet));
}

export function scanForStyleHex(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  HEX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEX_RE.exec(source)) !== null) {
    if (isSafe(m[0])) continue;
    const line = source.slice(0, m.index).split("\n").length;
    out.push({
      file,
      line,
      prop: m[1]!,
      snippet: m[0].replace(/\s+/g, " ").slice(0, 200),
    });
  }
  return out;
}

describe("no-style-hex invariant — colours route through --ft-* tokens", () => {
  it("no source file under src/ carries a literal hex in a style position", () => {
    const all: Violation[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      all.push(...scanForStyleHex(file, src));
    }
    if (all.length > 0) {
      const report = all
        .map((v) => `  ${relative(REPO_ROOT, v.file)}:${v.line}  [${v.prop}]  ${v.snippet}`)
        .join("\n");
      throw new Error(
        `Found ${all.length} literal hex colour(s) in a style position.\n` +
        `Themes cannot override literal hex, so on arctic these render at the wrong contrast.\n` +
        `Route through a --ft-* token or the --ft-id-N identity ramp.\n` +
        `If the value is a genuine theme/persona/skin definition, add the file suffix to ` +
        `EXEMPT_SUFFIXES in lib/no-style-hex.test.ts.\n\n` +
        `Violations:\n${report}`,
      );
    }
    expect(all).toEqual([]);
  });

  // Proves the scanner actually bites. A synthetic payload covering
  // the shapes the arctic audit found: inline style object, palette
  // array, border shorthand with an embedded hex, and a Recharts
  // axis fill.
  it("scanner detects hex in each style-position shape it exists to catch", () => {
    const synthetic = [
      `<div style={{ color: "#F59E0B" }} />`,
      `const P = [{ background: "#4ADE80" }];`,
      `<span style={{ border: "1px solid #30363d" }} />`,
      `<XAxis tick={{ fill: "#6b7280", fontSize: 10 }} />`,
    ].join("\n");
    const hits = scanForStyleHex("<synthetic>", synthetic);
    expect(hits.map((h) => h.prop).sort()).toEqual(
      ["background", "border", "color", "fill"].sort(),
    );
  });

  // The safe-pattern allowlist skips only what the audit explicitly
  // recorded as correct. Anything else must still fail.
  it("safe patterns are skipped; near-neighbours are not", () => {
    const safe = [
      `<button style={{ color: "#fff" }} />`,
      `<button style={{ color: "#FFFFFF" }} />`,
      `<button style={{ background: "#000" }} />`,
      `<div style={{ color: "var(--ft-cyan, #06b6d4)" }} />`,
    ].join("\n");
    expect(scanForStyleHex("<safe>", safe)).toEqual([]);
    const unsafe = `<div style={{ color: "#eee" }} />`;
    expect(scanForStyleHex("<unsafe>", unsafe)).toHaveLength(1);
  });
});
