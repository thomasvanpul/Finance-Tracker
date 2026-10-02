// Lock · the Settings › Connections panel follows DESIGN.md §10.
//
// Everything this panel draws is language: the connection's name, the
// provider-and-last-synced caption, the status badge, both error banners,
// the add form's field labels, fields and submit button, the loading line,
// the "survive" caption beside a confirm, and the two encryption notes.
// It draws no figure, so nothing in it is mono. If a figure is ever added
// here it should use `.pnum`, not a hand-written mono family.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./settings-connections.tsx"), "utf8");

function at(copy: string): number {
  const i = src.indexOf(copy);
  if (i < 0) throw new Error(`${copy} not found`);
  return i;
}

// The `<Text …>` opening tag that draws a piece of copy.
function textTagBefore(copy: string): string {
  const i = at(copy);
  const open = src.lastIndexOf("<Text", i);
  return src.slice(open, src.indexOf(">", open) + 1);
}

// The nearest `style={{ … }}` (or style object) above a piece of copy.
function styleBefore(copy: string, opener = "style={{"): string {
  const i = at(copy);
  return src.slice(src.lastIndexOf(opener, i), i);
}

const MONO = /--font-mono/;
const SANS = /--font-sans/;

describe("Connections type: language is sans", () => {
  it.each([
    ["the connection name", "{connection.label}\n"],
    ["the provider and last-synced caption", "Last synced {formatTs"],
    ["the survive caption beside a confirm", "Imported accounts and transactions survive\n"],
    ["the Provider field label", "\n            Provider\n"],
    ["a credential field label", "{f.label}\n"],
    ["the Label field label", "Label <span"],
    ["the validated-before-stored note", "Validated against {providerMeta"],
  ])("%s is not a mono <Text>", (_name, copy) => {
    expect(textTagBefore(copy)).not.toMatch(/\bmono\b/);
  });

  it.each([
    ["the status badge", "{status}\n"],
    ["the last-error banner", "{connection.lastError}\n"],
    ["the submit button", "VALIDATE + ADD"],
    ["the form's error banner", "{errorMessage}\n"],
    ["the loading line", "Loading…"],
    ["the trailing encryption note", "Credentials are AES-256-GCM at rest."],
  ])("%s is sans", (_name, copy) => {
    const block = styleBefore(copy);
    expect(block).toMatch(SANS);
    expect(block).not.toMatch(MONO);
  });

  it("the add form's fields are sans", () => {
    const block = styleBefore("return (\n    <form", "const inputStyle");
    expect(block).toMatch(SANS);
    expect(block).not.toMatch(MONO);
  });

  it("nothing in the panel is mono", () => {
    expect(src).not.toMatch(MONO);
    expect(src).not.toMatch(/<Text[^>]*\bmono\b/);
  });
});
