// Lock · Calculators follows DESIGN.md §10.
//
// The breadcrumb, page title and intro, each card's tag, name, description,
// bullets and launch button, the persona strip and the footer tip are
// language, so sans. The keyboard-shortcut badge (G·0) and the route path
// (FIRE, MORTGAGE …) are data, so mono, and stay.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./calculators.tsx"), "utf8");

function bodyOf(fnName: string): string {
  const start = src.search(new RegExp(`function ${fnName}\\(`));
  if (start < 0) throw new Error(`${fnName} not found`);
  const next = src.indexOf("\nfunction ", start + 1);
  const nextExport = src.indexOf("\nexport ", start + 1);
  const ends = [next, nextExport].filter((i) => i > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

// The style block that draws a piece of copy: from the nearest `style={{`
// before it up to the copy itself.
function styleBefore(copy: string, within = src): string {
  const at = within.indexOf(copy);
  if (at < 0) throw new Error(`${copy} not found`);
  return within.slice(within.lastIndexOf("style={{", at), at);
}

// The JSX opening tag of a <Text> that draws a piece of copy.
function textTagBefore(copy: string, within = src): string {
  const at = within.indexOf(copy);
  if (at < 0) throw new Error(`${copy} not found`);
  return within.slice(within.lastIndexOf("<Text", at), at);
}

describe("Calculators type: language is sans", () => {
  const card = bodyOf("ToolCard");

  it.each(["{tool.tag}", "{tool.description}", "LAUNCH →"])("draws %s in sans", (copy) => {
    const block = styleBefore(copy, card);
    expect(block).toContain("--font-sans");
    expect(block).not.toContain("--font-mono");
  });

  it("draws each bullet in sans", () => {
    // `{b}` alone first matches `key={b}`; the marker span sits inside the <li>.
    const block = styleBefore("<span style={{ color: tool.accent, flexShrink: 0", card);
    expect(block).toContain("--font-sans");
    expect(block).not.toContain("--font-mono");
  });

  it("draws the tool name without mono", () => {
    expect(textTagBefore("{tool.label}", card)).not.toMatch(/\bmono\b/);
  });

  it.each(["TOOLS › CALCULATORS", "PLANNING TOOLS", "Four calculators for", "<span style={{ color, fontWeight", "TIP — Keyboard"])(
    "draws %s in sans",
    (copy) => {
      const block = styleBefore(copy);
      expect(block).toContain("--font-sans");
      expect(block).not.toContain("--font-mono");
    },
  );
});

describe("Calculators type: data stays mono", () => {
  const card = bodyOf("ToolCard");

  it("keeps the keyboard-shortcut badge mono", () => {
    expect(styleBefore("{tool.code}", card)).toContain("--font-mono");
  });

  it("keeps the route path mono", () => {
    expect(textTagBefore('{tool.href.replace("/", "").toUpperCase()}', card)).toMatch(/\bmono\b/);
  });
});
