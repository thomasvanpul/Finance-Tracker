// Lock · the sign-in screen follows DESIGN.md §10.
//
// The email, name and password fields, every button (primary, secondary,
// passkey and provider, and the underlined links), the error sentence, the
// "OR" divider and the cold-start hint are language, so sans.
//
// The two-factor code field holds a six-digit code read digit by digit, so it
// is data, and stays mono.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./auth-gate.tsx"), "utf8");

function at(copy: string, within = src): number {
  const i = within.indexOf(copy);
  if (i < 0) throw new Error(`${copy} not found`);
  return i;
}

// A style constant's object literal, from its declaration to the closing `};`.
function constBody(name: string): string {
  const start = at(`const ${name}: React.CSSProperties = {`);
  return src.slice(start, src.indexOf("\n};", start));
}

// The `<Text …>` opening tag that draws a piece of copy.
function textTagBefore(copy: string): string {
  const i = at(copy);
  const open = src.lastIndexOf("<Text", i);
  return src.slice(open, src.indexOf(">", open) + 1);
}

const MONO = /--font-mono/;
const SANS = /--font-sans/;

describe("Sign-in type: language is sans", () => {
  it.each(["INPUT_STYLE", "PRIMARY_BTN", "SECONDARY_BTN", "LINK_BTN"])(
    "%s is sans",
    (name) => {
      const body = constBody(name);
      expect(body).toMatch(SANS);
      expect(body).not.toMatch(MONO);
    },
  );

  it("the error sentence is not mono", () => {
    expect(textTagBefore("{error.message}")).not.toMatch(/\bmono\b/);
  });

  it("the OR divider is not mono", () => {
    expect(textTagBefore("\n            OR\n")).not.toMatch(/\bmono\b/);
  });

  it("the cold-start hint is sans", () => {
    const i = at('{makeAuthError("server_waking").message}');
    const block = src.slice(src.lastIndexOf("style={{", i), i);
    expect(block).toMatch(SANS);
    expect(block).not.toMatch(MONO);
  });
});

describe("Sign-in type: data stays mono", () => {
  it("the two-factor code field is mono", () => {
    const i = at('placeholder="000000"');
    const style = src.slice(i, src.indexOf("/>", i));
    expect(style).toMatch(MONO);
  });
});
