// Lock · the floating AI agent panel follows DESIGN.md §10.
//
// The panel is mounted by the desktop layout, so it rides on every page.
// Language is sans: the panel itself, its title, the page name in the
// context strip (when the route has one; a bare route path is data and
// stays mono), the composer, the empty-state sentence, the starter prompts,
// every message body, and the words of the minimal-style hint. The G in that
// hint is a key, so mono. The short uppercase legends (GROQ, CONTEXT, READY,
// TRY, COACH) stay MonoLabel, as the section legends in the shortcut overlay
// and command palette did. The ◇ glyph is a symbol and is left as it was.
//
// The /coach page has its own lock (pages/ai-coach-type.lock.test.ts); this
// is the floating panel, which is a separate component.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./ai-agent.tsx"), "utf8");

function at(copy: string): number {
  const i = src.indexOf(copy);
  if (i < 0) throw new Error(`${copy} not found`);
  return i;
}

// The nearest style object above a piece of copy.
function styleBefore(copy: string): string {
  const i = at(copy);
  return src.slice(src.lastIndexOf("style={{", i), i);
}

// The opening tag that wraps a piece of copy.
function tagBefore(copy: string): string {
  const i = at(copy);
  return src.slice(src.lastIndexOf("<", src.lastIndexOf(">", i - 1)), i);
}

const MONO = /--font-mono/;
const SANS = /--font-sans/;

describe("AI agent type: language is sans", () => {
  it("the panel is sans", () => {
    const i = at("No accent stripe: the frame is the identity.");
    const block = src.slice(src.lastIndexOf("style={{", i), src.indexOf("}}>", i));
    expect(block).toMatch(SANS);
    expect(block).not.toMatch(MONO);
  });

  it.each([
    ["the composer", "\n          }}\n        />\n        <button\n          type=\"button\"\n          onClick={handleSend}"],
    ["the empty-state sentence", "\n          Ask about your finances. I read"],
    ["each starter prompt", "\n            {s}\n          </button>"],
    ["each message body", "\n            {msg.text}\n          </div>"],
    ["the minimal-style hint", "\n          Press "],
  ])("%s is sans", (_name, copy) => {
    const block = styleBefore(copy) + copy;
    expect(block).toMatch(SANS);
    expect(block).not.toMatch(MONO);
  });

  it.each([
    ["the panel title", '{"AI Coach"}'],
    ["the page name in the context strip", "{PAGE_LABELS[location]}</Text>"],
  ])("%s is not drawn as a mono label", (_name, copy) => {
    expect(tagBefore(copy)).not.toMatch(/MonoLabel|\bmono\b/);
  });
});

describe("AI agent type: keys and route paths stay mono", () => {
  it("a route with no page name shows its path as a mono label", () => {
    expect(tagBefore("{location}</MonoLabel>")).toMatch(/MonoLabel/);
  });

  it("the G in 'Press G for AI' is mono", () => {
    expect(src).toMatch(/Press <span style=\{\{ fontFamily: "var\(--font-mono\)" \}\}>G<\/span> for AI/);
  });
});
