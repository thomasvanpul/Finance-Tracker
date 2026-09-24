// Cash-label lock.
//
// The figure the API calls `totalCash`, and the signed sum of the
// /accounts table, is EVERY account: a Kuala Lumpur flat, a SIPP, an ISA
// and a loan netted against the current accounts. On the seed account
// that is ~£215k against ~£11k of actual cash. 2697c1b (11 Sep) took the
// word "Cash" off the five desktop KPI layouts and the /accounts KPI
// cell, but missed the /accounts table, whose header said CASH ACCOUNTS and
// whose footer kept printing `TOTAL CASH £215,153.27` (findings
// 1b1c4cd05672 and d1a31b57a8b6).
//
// What this locks: no text node and no string literal in these two files
// says "total cash", and no KPI item on the desktop bar that reads
// `data.totalCash` is labelled "Cash". Comments are not text nodes, so
// the explanation of the old defect can stay in the source.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const SRC = join(dirname(__filename), "..");
const ACCOUNTS_PATH = join(SRC, "pages/accounts.tsx");
const KPI_BAR_PATH = join(SRC, "components/kpi-bar.tsx");

function parse(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

// Every rendered or renderable string in the file: JSX text, string
// literals and template-literal chunks. Comments are trivia and excluded.
function visibleStrings(sf: ts.SourceFile): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxText(node) ||
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      out.push({ text: node.text, line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

// "total cash" anywhere, or a JSX text node that is exactly "cash accounts"
// (the /accounts panel header over the same all-types table). A sentence
// that mentions cash accounts, like the reconciliation note that really
// does check only type=cash rows, is not a heading and is not caught.
const TOTAL_CASH = /total\s+cash|^\s*cash\s+accounts\s*$/i;

describe("cash label lock", () => {
  for (const path of [ACCOUNTS_PATH, KPI_BAR_PATH]) {
    it(`${path.slice(SRC.length + 1)} never prints "total cash" or a "cash accounts" heading`, () => {
      const hits = visibleStrings(parse(path)).filter(s => TOTAL_CASH.test(s.text));
      expect(hits.map(h => `:${h.line} ${h.text.trim()}`)).toEqual([]);
    });
  }

  it('no desktop KPI item reading data.totalCash is labelled "Cash"', () => {
    const sf = parse(KPI_BAR_PATH);
    const labels: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isObjectLiteralExpression(node)) {
        const prop = (name: string) =>
          node.properties.find(
            (p): p is ts.PropertyAssignment =>
              ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name,
          );
        const raw = prop("raw");
        const label = prop("label");
        if (raw && label && raw.initializer.getText(sf) === "data.totalCash" && ts.isStringLiteral(label.initializer)) {
          labels.push(label.initializer.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    // Guard against the lock going vacuous if the field is renamed.
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter(l => /\bcash\b/i.test(l))).toEqual([]);
  });
});
