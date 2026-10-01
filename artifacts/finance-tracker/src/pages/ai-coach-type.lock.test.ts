// Lock · AI Coach follows DESIGN.md §10.
//
// The coach's replies, the user's own messages, prompt and insight labels,
// buttons, status lines, the hero copy, the composer and its footer are
// language, so sans. The KPI figures and their legends, the list numerals,
// the persona code and the ↵ key hint are data, so mono, and stay.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./ai-coach.tsx"), "utf8");

function bodyOf(fnName: string): string {
  const start = src.search(new RegExp(`function ${fnName}\\(`));
  if (start < 0) throw new Error(`${fnName} not found`);
  const next = src.indexOf("\nfunction ", start + 1);
  const nextExport = src.indexOf("\nexport ", start + 1);
  const ends = [next, nextExport].filter((i) => i > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

// The style block that draws a piece of literal copy: from the nearest
// `style={{` before it up to the copy itself.
function styleBefore(copy: string): string {
  const at = src.indexOf(copy);
  if (at < 0) throw new Error(`${copy} not found`);
  return src.slice(src.lastIndexOf("style={{", at), at);
}

describe("AI Coach type: language is sans", () => {
  it("draws the coach's paragraphs and list items in sans", () => {
    const md = bodyOf("renderMarkdown");
    expect(md).not.toMatch(/<Text as="span" mono size=\{12\}>/);
    expect(md).not.toMatch(/margin: "6px 0 0", fontFamily: "var\(--font-mono\)"/);
  });

  it("draws the user's own message in sans", () => {
    expect(bodyOf("MessageBubble")).not.toMatch(/fontFamily: "var\(--font-mono\)", fontSize: 12, lineHeight: 1\.65/);
  });

  it("draws the insight card's title, body and ASK label in sans", () => {
    const card = bodyOf("SmartInsightCard");
    expect(card).not.toMatch(/var\(--font-mono\)[^>]*>\{item\.title\}/);
    expect(card).not.toMatch(/var\(--font-mono\)[^>]*>\{item\.body\}/);
    expect(card).not.toMatch(/var\(--font-mono\)[^>]*>ASK/);
  });

  it("draws the suggested prompt's label in sans and keeps its ↵ hint mono", () => {
    const btn = bodyOf("SuggestedPromptButton");
    expect(btn).not.toMatch(/var\(--font-mono\)[^>]*>\{prompt\.label\}/);
    expect(btn).toMatch(/var\(--font-mono\)[^>]*>↵/);
  });

  it.each([
    "New Chat",
    "Your AI Financial Coach",
    "Streamed from Groq",
  ])("draws %s in sans", (copy) => {
    expect(styleBefore(copy)).not.toContain("--font-mono");
  });

  it("draws the availability check line in sans", () => {
    expect(styleBefore("<Loader2 size={10}")).not.toContain("--font-mono");
  });

  it("draws the AI OFFLINE explanation in sans", () => {
    expect(styleBefore("<MonoLabel as=\"span\" size={9} color=\"var(--ft-red)\"")).not.toContain("--font-mono");
  });

  it("draws the hero description and the starter labels in sans", () => {
    expect(src).not.toMatch(/<Text as="div" mono size=\{10\} color="var\(--ft-dim\)" lineHeight=\{1\.7\}>/);
    expect(src).not.toMatch(/var\(--font-mono\)[^>]*>\{s\.label\}/);
  });

  it("draws the composer in sans", () => {
    expect(styleBefore("padding: \"10px 12px\",\n              resize")).not.toContain("--font-mono");
  });
});

describe("AI Coach type: data stays mono", () => {
  it.each(["Income", "Spent", "Savings Rate"])("keeps the %s legend mono", (legend) => {
    expect(styleBefore(`>${legend}</div>`)).toContain("--font-mono");
  });

  it("keeps the savings-rate figure, list numerals and persona code mono", () => {
    expect(src).toMatch(/var\(--font-mono\)", fontSize: 15[^>]*>\s*<span className="pnum">\{srPct/);
    expect(src).toMatch(/var\(--font-mono\)[^>]*>\s*\{String\(j \+ 1\)\.padStart/);
    expect(src).toMatch(/var\(--font-mono\)[^>]*>\s*\{primaryPersona\.code\}/);
  });
});
