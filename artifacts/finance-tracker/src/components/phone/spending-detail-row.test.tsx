// DESIGN.md §10: a date is data, so it is mono. The transaction sheet's
// DetailRow had no way to say a value was data, and drew DATE in the inherited
// sans beside DESCRIPTION, CATEGORY and ACCOUNT, which are names and stay sans.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DetailRow } from "./SpendingScreen";

function valueSpan(html: string, text: string): string {
  const at = html.indexOf(`>${text}<`);
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<span", at), at);
}

describe("SPENDING transaction sheet DetailRow", () => {
  it("draws a data value in mono", () => {
    const span = valueSpan(renderToStaticMarkup(<DetailRow label="DATE" value="2026-09-30" mono />), "2026-09-30");
    expect(span).toContain("font-family:var(--font-mono)");
  });

  it("leaves a language value in the inherited sans", () => {
    const span = valueSpan(renderToStaticMarkup(<DetailRow label="CATEGORY" value="Groceries" />), "Groceries");
    expect(span).not.toContain("font-mono");
  });

  it("marks the DATE row as data at its call site", () => {
    const src = readFileSync(path.resolve(__dirname, "./SpendingScreen.tsx"), "utf8");
    expect(src).toMatch(/<DetailRow label="DATE" value=\{tx\.date\} mono \/>/);
  });
});
