// Lock: every var(--ft-*) referenced in src/ must be defined in index.css.
//
// CSS custom properties fail silently — an undefined token resolves to
// nothing, so a colour disappears without error. TypeScript cannot see it,
// tests do not catch it, and it only shows up when someone looks at the
// right screen in the right theme. This test makes that class of defect
// mechanically detectable.
//
// Dynamic / template-literal sites:
//   `var(--ft-id-${slot})` in split.tsx cannot be resolved statically.
//   The regex extracts "--ft-id-" (the partial prefix before ${}). Any such
//   partial token (ending with "-") must appear in DYNAMIC_PARTIAL_PREFIXES
//   with a comment stating which file it comes from and why it is safe.
//
// Adding a new dynamic site: add an entry to DYNAMIC_PARTIAL_PREFIXES with
// file path and the reason the referenced slots are all defined.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = join(dirname(__filename), "..");
const INDEX_CSS = join(SRC_DIR, "index.css");

// Known dynamic token prefixes — each entry must include the source location.
const DYNAMIC_PARTIAL_PREFIXES = new Set([
  "--ft-id-", // split.tsx:137 — `var(--ft-id-${slot})`, slots 1–12 are all defined in index.css
]);

function stripTsComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

function stripCssComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ");
}

function extractDefinedTokens(cssContent: string): Set<string> {
  const clean = stripCssComments(cssContent);
  const tokens = new Set<string>();
  for (const m of clean.matchAll(/--ft-[a-zA-Z0-9_-]+(?=\s*:)/g)) {
    tokens.add(m[0]);
  }
  return tokens;
}

function extractUsedTokens(
  fileContent: string,
  ext: string,
): { literal: Set<string>; dynamic: Set<string> } {
  const clean = ext === ".css" ? stripCssComments(fileContent) : stripTsComments(fileContent);
  const literal = new Set<string>();
  const dynamic = new Set<string>();
  for (const m of clean.matchAll(/var\((--ft-[a-zA-Z0-9_-]*)/g)) {
    const token = m[1];
    if (token.endsWith("-")) {
      dynamic.add(token);
    } else {
      literal.add(token);
    }
  }
  return { literal, dynamic };
}

function walkSrc(dir: string, exts: Set<string>): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkSrc(full, exts));
    } else if (exts.has(extname(entry)) && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      results.push(full);
    }
  }
  return results;
}

describe("CSS design-token lock — var(--ft-*) references must be defined", () => {
  const cssContent = readFileSync(INDEX_CSS, "utf8");
  const defined = extractDefinedTokens(cssContent);

  it("index.css defines at least the core set of tokens", () => {
    const required = ["--ft-base", "--ft-surface", "--ft-raised", "--ft-text", "--ft-accent", "--ft-border", "--ft-muted"];
    const missing = required.filter((t) => !defined.has(t));
    expect(missing, `Core tokens absent from index.css: ${missing.join(", ")}`).toHaveLength(0);
  });

  it("all var(--ft-*) literal references in src/ are defined in index.css", () => {
    const files = walkSrc(SRC_DIR, new Set([".ts", ".tsx", ".css"]));
    const undeclared: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const ext = extname(file);
      const { literal } = extractUsedTokens(content, ext);

      for (const token of literal) {
        if (!defined.has(token)) {
          const rel = relative(SRC_DIR, file);
          undeclared.push(`${rel}: ${token}`);
        }
      }
    }

    expect(
      undeclared,
      `Undefined --ft-* tokens found:\n${undeclared.join("\n")}\n\nAdd the token to index.css or (if it is a design-system alias) fix the reference.`,
    ).toHaveLength(0);
  });

  it("all dynamic var(--ft-*) prefix sites are in the allowlist", () => {
    const files = walkSrc(SRC_DIR, new Set([".ts", ".tsx", ".css"]));
    const unknownDynamic: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const ext = extname(file);
      const { dynamic } = extractUsedTokens(content, ext);

      for (const prefix of dynamic) {
        if (!DYNAMIC_PARTIAL_PREFIXES.has(prefix)) {
          const rel = relative(SRC_DIR, file);
          unknownDynamic.push(`${rel}: ${prefix} (template literal — add to DYNAMIC_PARTIAL_PREFIXES with reason)`);
        }
      }
    }

    expect(
      unknownDynamic,
      `Unlisted dynamic --ft-* token sites:\n${unknownDynamic.join("\n")}`,
    ).toHaveLength(0);
  });
});
