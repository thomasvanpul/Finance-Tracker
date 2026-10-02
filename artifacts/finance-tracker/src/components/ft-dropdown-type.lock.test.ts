// Lock · FtDropdown and the phone empty/error primitives follow DESIGN.md §10.
//
// FtDropdown renders on /tax: Country, Tax Year, and the Tax Year field in the
// add-contribution dialog. Its "Country" / "Tax Year" label is a form field
// label, so sans. What the trigger and the options show depends on the
// caller: country names are language, tax years ("2025/26") are dates. So the
// family is a prop, `mono`, sans by default, and the two Tax Year callers pass
// it. The country code prefix ("GB") is a code, so it is always mono.
//
// MobileEmptyState and PhoneSectionError render on every phone tab with no
// data or a failed load. Their uppercase label ("NO TRANSACTIONS", "COULDN'T
// LOAD") is an eyebrow over a sentence, not a legend over a figure, so it is
// sans, the way the "DESKTOP FOR NOW" eyebrow went in 6065ea8.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const dropdown = read("./ft-dropdown.tsx");
const mobileUi = read("./mobile/mobile-ui.tsx");
const tax = read("../pages/tax.tsx");

// The opening tag that wraps a piece of copy.
function tagBefore(src: string, copy: string): string {
  const i = src.indexOf(copy);
  if (i < 0) throw new Error(`${copy} not found`);
  return src.slice(src.lastIndexOf("<", src.lastIndexOf(">", i - 1)), i);
}

function slice(src: string, from: string, to: string): string {
  const start = src.indexOf(from);
  if (start < 0) throw new Error(`${from} not found`);
  const end = src.indexOf(to, start + from.length);
  if (end < 0) throw new Error(`${to} not found`);
  return src.slice(start, end);
}

const FAMILY_BY_PROP = 'fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)"';

describe("FtDropdown type", () => {
  it("the field label is sans", () => {
    const tag = tagBefore(dropdown, "{label}\n");
    expect(tag).not.toContain("--font-mono");
    expect(tag).toContain("--font-sans");
  });

  it("the trigger takes its family from the mono prop", () => {
    expect(tagBefore(dropdown, "{selected?.prefix && (")).toContain(FAMILY_BY_PROP);
  });

  it("each option takes its family from the mono prop", () => {
    expect(tagBefore(dropdown, "{opt.prefix &&")).toContain(FAMILY_BY_PROP);
  });

  it("mono is off unless the caller asks for it", () => {
    expect(dropdown).toMatch(/mono = false/);
  });

  it("the code prefix is mono in the trigger and in every option", () => {
    expect(tagBefore(dropdown, "{selected.prefix}")).toContain("--font-mono");
    expect(tagBefore(dropdown, "{opt.prefix}")).toContain("--font-mono");
  });
});

describe("FtDropdown callers on /tax", () => {
  it("the Country dropdown shows names, so it does not ask for mono", () => {
    expect(slice(tax, 'label="Country"', "/>")).not.toMatch(/\bmono\b/);
  });

  it("both Tax Year dropdowns show years, so they ask for mono", () => {
    expect(slice(tax, 'label="Tax Year"', "/>")).toMatch(/\bmono\b/);
    expect(slice(tax, "value={shelterForm.taxYear}", "/>")).toMatch(/\bmono\b/);
  });
});

describe("phone empty and error primitives type", () => {
  it("MobileEmptyState's label is sans", () => {
    expect(slice(mobileUi, "const labelEl = (", "{label}")).not.toContain("--font-mono");
  });

  it("PhoneSectionError's label is sans", () => {
    expect(slice(mobileUi, "export function PhoneSectionError(", "{label}")).not.toContain("--font-mono");
  });
});
