// Lock · the dashboard's Financial Health widget follows DESIGN.md §10
// (finding 928333794e02).
//
// The component names and their descriptions, each breakdown item's title and
// message, and the verdict sentence are language, so sans (the health-score
// page settled pillar names the same way). The points, the total and its
// "/ 100", the band, the high/medium/low impact (enum state), the 0-40-70-100
// scale and the Score Breakdown header are data, state or headers, so mono,
// and stay.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./financial-health.tsx"), "utf8");

// Where a piece of copy is drawn: the one line that is only that copy, so a
// prop or a comment naming it does not match.
function drawnAt(copy: string): number {
  const escaped = copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\n[ \\t]*${escaped}[ \\t]*\\n`, "g");
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) throw new Error(`${copy}: ${hits.length} drawn lines, expected 1`);
  return src.indexOf(copy, hits[0].index);
}

// The style block that draws a piece of copy.
function styleBefore(copy: string): string {
  const at = drawnAt(copy);
  return src.slice(src.lastIndexOf("style={{", at), at);
}

// {label} is drawn twice, once per row kind; the Nth occurrence.
function styleBeforeNth(copy: string, n: number): string {
  const escaped = copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hits = [...src.matchAll(new RegExp(`\\n[ \\t]*${escaped}[ \\t]*\\n`, "g"))];
  const at = src.indexOf(copy, hits[n].index);
  return src.slice(src.lastIndexOf("style={{", at), at);
}

function expectSans(block: string) {
  expect(block).toContain("--font-sans");
  expect(block).not.toContain("--font-mono");
}

describe("Financial Health type: language is sans", () => {
  it.each(["{description}", "{message}", "{verdict}"])("draws %s in sans", (copy) =>
    expectSans(styleBefore(copy)));

  it("draws the component name and the breakdown title in sans", () => {
    expectSans(styleBeforeNth("{label}", 0));
    expectSans(styleBeforeNth("{label}", 1));
  });
});

describe("Financial Health type: data stays mono", () => {
  it.each(["{pts}", "{impact}", "{result.total}", "/ 100", "{band}", "{v}", "Score Breakdown"])(
    "keeps %s mono", (copy) => expect(styleBefore(copy)).toContain("--font-mono"));
});
