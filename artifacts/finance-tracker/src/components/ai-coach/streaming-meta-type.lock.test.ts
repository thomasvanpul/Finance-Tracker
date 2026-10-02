// Lock · the AI Coach streaming strips follow DESIGN.md §10.
//
// These strips render inside both the floating panel (components/ai-agent.tsx)
// and the /coach page (pages/ai-coach.tsx). Language is sans: the progress
// caption, "Asking", "failed → trying", "served by", "disconnected mid-reply",
// the retry sentence, the error message and the queued prompt the user typed.
// The short uppercase legends (REDUCED CAPACITY, RESPONSE ENDED EARLY, ERROR,
// QUEUED) and the provider names (GROQ, as in the panel header) stay
// MonoLabel, as the panel's own legends did in 8cde23b. The ▸ and ✕ glyphs
// are symbols and are left as they were.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./streaming-meta.tsx"), "utf8");

function at(copy: string): number {
  const i = src.indexOf(copy);
  if (i < 0) throw new Error(`${copy} not found`);
  return i;
}

// The opening tag that wraps a piece of copy.
function tagBefore(copy: string): string {
  const i = at(copy);
  return src.slice(src.lastIndexOf("<", src.lastIndexOf(">", i - 1)), i);
}

const MONO = /MonoLabel|--font-mono|\bmono\b/;

describe("streaming strips type: language is sans", () => {
  it.each([
    ["the progress caption", "{caption}"],
    ["Asking", "Asking"],
    ["failed → trying", "failed → trying"],
    ["served by", "· served by"],
    ["disconnected mid-reply", "disconnected mid-reply"],
    ["the retry sentence", "Ask again to retry"],
    ["the error message", "{message}"],
    ["the queued prompt", "{text}"],
  ])("%s is sans", (_name, copy) => {
    const tag = tagBefore(copy);
    expect(tag).not.toMatch(MONO);
    expect(tag).toMatch(/<Words\b|--font-sans/);
  });

  it("Words draws sans", () => {
    const i = at("function Words(");
    expect(src.slice(i, src.indexOf("\n}\n", i))).toMatch(/fontFamily: "var\(--font-sans\)"/);
  });
});

describe("streaming strips type: legends and provider names stay mono", () => {
  it.each([
    "REDUCED CAPACITY",
    "RESPONSE ENDED EARLY",
    "ERROR",
    "QUEUED",
    "{provider.toUpperCase()}",
    "{from.toUpperCase()}",
    "{to.toUpperCase()}",
  ])("%s is a MonoLabel", (copy) => {
    expect(tagBefore(copy)).toMatch(/<MonoLabel\b/);
  });
});
