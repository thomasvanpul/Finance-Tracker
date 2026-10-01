// KPI sign lock.
//
// DESIGN.md §7: "Gain/loss legibility never depends on hue alone — the sign
// or the glyph carries it too." The dashboard KPI strip broke it: MONTHLY
// SPEND rendered `£40.45` in red with no glyph, I OWE the same, and their
// green counterparts MONTHLY INCOME and OWED TO ME printed a bare figure in
// green (finding 650a00cd9c7c, 2026-10-01). On a colour-blind reader, or the
// one light theme, the four read as four neutral totals.
//
// What this locks: every `KpiCellData` literal in pages/dashboard.tsx whose
// `valueColor` can be --ft-red or --ft-green has a sign glyph (+ − -) or a
// sign-named identifier in its `value` expression. Lock #19
// (sign-glyph.lock.test.ts) separately keeps that glyph off a value the
// formatter already signed.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const DASHBOARD = join(dirname(fileURLToPath(import.meta.url)), "..", "pages", "dashboard.tsx");

// Cells whose colour is not a sign, each with the reason.
const EXEMPT: Record<string, string> = {
  // Green/amber/red here rates the size of a rate against 20% and 10%
  // thresholds; a 7% savings rate is red and still a positive number.
  SAVINGS_RATE: "colour is a threshold rating, not a gain/loss sign",
};

const SIGN_COLOUR = /--ft-(red|green)\b/;
const SIGN_SOURCE = /["'`][^"'`]*[+−-]|\bsign\b|[a-z]Sign\b/i;

function kpiCells(): { name: string; value: string; valueColor: string }[] {
  const source = ts.createSourceFile(DASHBOARD, readFileSync(DASHBOARD, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const cells: { name: string; value: string; valueColor: string }[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.type?.getText(source) === "KpiCellData" &&
      node.initializer && ts.isObjectLiteralExpression(node.initializer)
    ) {
      const prop = (key: string) => {
        const p = node.initializer && ts.isObjectLiteralExpression(node.initializer)
          ? node.initializer.properties.find((q) => q.name?.getText(source) === key)
          : undefined;
        return p && ts.isPropertyAssignment(p) ? p.initializer.getText(source) : "";
      };
      cells.push({ name: node.name.getText(source), value: prop("value"), valueColor: prop("valueColor") });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return cells;
}

describe("KPI sign", () => {
  it("finds the dashboard KPI cells", () => {
    expect(kpiCells().length).toBeGreaterThanOrEqual(10);
  });

  it("a red or green KPI value carries a sign glyph", () => {
    const bare = kpiCells()
      .filter((c) => !(c.name in EXEMPT) && SIGN_COLOUR.test(c.valueColor) && !SIGN_SOURCE.test(c.value))
      .map((c) => c.name);
    expect(bare).toEqual([]);
  });

  it("every exemption still names a cell", () => {
    const names = new Set(kpiCells().map((c) => c.name));
    expect(Object.keys(EXEMPT).filter((n) => !names.has(n))).toEqual([]);
  });
});
