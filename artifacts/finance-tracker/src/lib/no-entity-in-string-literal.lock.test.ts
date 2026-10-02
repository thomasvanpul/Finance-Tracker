// Lock · no HTML entity inside a JS string literal that JSX renders.
//
// JSX decodes `&gt;` in text and in attribute strings, but not in a string
// inside `{…}`: `{busy ? "…" : "&gt; Continue"}` paints the five characters
// "&gt;" on the button. Settings › Connections and the 2FA buttons in the
// profile page shipped exactly that ("&gt; Verify &amp; Activate"). Write the
// character itself in a JS string.
//
// Source read, the same way the other *.lock.test.ts files do. The pattern is
// a quoted string opened right after `?`, `:`, `{`, `(` or `,` — expression
// position — so attribute strings (`title="a &amp; b"`) are not matched.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return tsxFiles(p);
    return p.endsWith(".tsx") ? [p] : [];
  });
}

const ENTITY_IN_LITERAL = /[?:{(,]\s*(["'`])[^"'`\n]*&(?:[a-z]+|#\d+);/;

describe("no HTML entity inside a rendered JS string", () => {
  it("every .tsx under src writes the character, not the entity", () => {
    const hits = tsxFiles(SRC).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          ENTITY_IN_LITERAL.test(line) ? [`${path.relative(SRC, file)}:${i + 1}: ${line.trim()}`] : [],
        ),
    );
    expect(hits).toEqual([]);
  });
});
