import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AccountInputCurrency } from "@workspace/api-client-react";
import { figureSegments } from "@/lib/figure-segments";

// Privacy mode blurs `.pnum` (index.css, body.privacy-mode .pnum). An
// insight's headline and body are plain strings built by producers with
// formatMoney, so InsightSlot rendered "£31 outstanding for 74 days." with
// no `.pnum` anywhere and the figure stayed readable with privacy on —
// the one HOME figure a 1 Oct render found unmasked (finding ee9441fb0ce2).
// figureSegments finds the money and percentage figures in such a string so
// the slot can wrap each one in `.pnum`. Counts and dates are not figures.

const figuresOf = (s: string) => figureSegments(s).filter((p) => p.figure).map((p) => p.text);
const LOCALES = ["en-GB", "de-DE", "fr-FR"]; // lib/utils.ts getNumberLocale

describe("figureSegments", () => {
  it("finds the money in the debt-by-age body and leaves the count alone", () => {
    expect(figureSegments("£31 outstanding for 74 days.")).toEqual([
      { text: "£31", figure: true },
      { text: " outstanding for 74 days.", figure: false },
    ]);
  });

  it("joins back to the original string, always", () => {
    for (const s of ["", "3 BILLS DUE THIS WEEK", "18% of spending, £412.00 this month", "Down to -£1,500.00 on Wed 23 Sep"]) {
      expect(figureSegments(s).map((p) => p.text).join("")).toBe(s);
    }
  });

  it("finds every currency the app holds, in every number locale, signed or not", () => {
    for (const locale of LOCALES) {
      for (const currency of Object.values(AccountInputCurrency)) {
        for (const value of [1234.56, -1234.56, 7]) {
          const fig = new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
          expect(figuresOf(`from ${fig} now`), `${locale} ${currency} ${value}`).toEqual([fig]);
        }
      }
    }
  });

  it("finds a percentage", () => {
    expect(figuresOf("18% of spending, £412 this month")).toEqual(["18%", "£412"]);
  });

  it("does not take a count, a date or a word for a figure", () => {
    for (const s of ["3 BILLS DUE THIS WEEK", "2 payments first", "going out by Wed 23 Sep", "MYR account"]) {
      expect(figuresOf(s), s).toEqual([]);
    }
  });
});

describe("InsightSlot masks its figures", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "components", "phone", "InsightSlot.tsx"),
    "utf8",
  );
  it("renders headline and body through figureSegments, figures as .pnum", () => {
    expect(src).toMatch(/figureSegments\(/);
    expect(src).toMatch(/className="pnum"/);
    // Rendered bare as a child, a string carries no `.pnum`.
    expect(src).not.toMatch(/^\s*\{insight\.body\}\s*$/m);
    expect(src).not.toMatch(/>\{insight\.headline\}<|: insight\.headline\}/);
  });
});
