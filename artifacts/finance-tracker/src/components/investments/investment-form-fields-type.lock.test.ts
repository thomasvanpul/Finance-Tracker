// Lock · the add/edit position form follows DESIGN.md §10.
//
// The form renders in the desktop /investments dialogs and the phone's
// add-position sheet. Language is sans: the asset-class select (a word
// chosen from a list), the "Auto-detected: …" sentence, the Per Share /
// Total Cost buttons, and the "US market" words in the fallback exchange
// hint. Data stays mono: the ticker and number inputs, the exchange code and
// currency code in the hint ("LSE · GBP"), the Effective Cost / Share legend
// beside its figure, and the figure itself.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./investment-form-fields.tsx"), "utf8");

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

const MONO = /MonoLabel|--font-mono|\bmono\b|\bINP\b/;

describe("position form type: language is sans", () => {
  it.each([
    ["the asset-class select", "<SelectValue />"],
    ["the auto-detected sentence", "Auto-detected:"],
    ["the input-method buttons", `{mode === "perShare" ? "Per Share" : "Total Cost"}`],
    ["the US market words", "US market"],
  ])("%s is sans", (_name, copy) => {
    const tag = tagBefore(copy);
    expect(tag).not.toMatch(MONO);
  });

  it("the input-method buttons name the sans family", () => {
    expect(tagBefore(`{mode === "perShare" ? "Per Share" : "Total Cost"}`)).toMatch(/--font-sans/);
  });

  it("the asset-class select names the sans family", () => {
    expect(tagBefore("<SelectValue />")).toMatch(/--font-sans/);
  });
});

describe("position form type: data stays mono", () => {
  it("INP, the style on the ticker and number inputs, is mono", () => {
    expect(src).toMatch(/const INP: React\.CSSProperties = \{ fontFamily: "var\(--font-mono\)"/);
  });

  it.each([
    ["the ticker input", 'placeholder="e.g. VOO or 0700.HK"'],
    ["the shares input", 'placeholder="10"'],
    ["the cost input", 'placeholder="420.50"'],
    ["the total-cost input", 'placeholder="4205.00"'],
    ["the fees input", 'placeholder="0.00"'],
  ])("%s carries INP", (_name, copy) => {
    const i = at(copy);
    expect(src.slice(src.lastIndexOf("<Input", i), src.indexOf("/>", i))).toMatch(/style=\{INP\}/);
  });

  it.each([
    ["the exchange and currency codes", "{ex.label} · {ex.currency}"],
    ["the fallback currency code", "· {form.nativeCurrency}"],
    ["the effective-cost figure", "{effectiveCostPerShare.toFixed(4)}"],
  ])("%s is mono", (_name, copy) => {
    expect(tagBefore(copy)).toMatch(/\bmono\b|--font-mono/);
  });

  it("the Effective Cost / Share legend is a MonoLabel", () => {
    expect(tagBefore("Effective Cost / Share")).toMatch(/<MonoLabel\b/);
  });
});
