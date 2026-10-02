// Lock · the keyboard-shortcut overlay (?) follows DESIGN.md §10.
//
// Language is sans: the overlay's title, the words of the close hint, and
// every action name in the grid ("Dashboard", "Command palette", the active
// profile's tagline). Data is mono: every key (<kbd>), the ESC inside the
// close hint, and the section legends (NAVIGATION, ACTIONS, …) that head a
// column of keys — the same split the command palette makes.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./keyboard-shortcuts.tsx"), "utf8");

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

const MONO = /--font-mono/;
const SANS = /--font-sans/;

describe("Shortcut overlay type: language is sans", () => {
  it.each([
    ["the overlay title", "KEYBOARD SHORTCUTS"],
    ["each action name", ">{label}</span>"],
  ])("%s is sans", (_name, copy) => {
    const block = styleBefore(copy);
    expect(block).toMatch(SANS);
    expect(block).not.toMatch(MONO);
  });

  it("the words of the close hint are sans", () => {
    const open = src.lastIndexOf("<span", at("onClick={onClose}\n            style"));
    const tag = src.slice(open, src.indexOf(">", at("onClick={onClose}\n            style")));
    expect(tag).toMatch(SANS);
    expect(tag).not.toMatch(MONO);
    expect(src).toMatch(/<\/span>\s*TO CLOSE/);
  });
});

describe("Shortcut overlay type: keys and legends stay mono", () => {
  it.each([
    ["each key", "{key}</kbd>"],
    ["the ESC in the close hint", "ESC</span>"],
    ["each section legend", "{sec.label}\n                </div>"],
  ])("%s is mono", (_name, copy) => {
    expect(styleBefore(copy)).toMatch(MONO);
  });
});
