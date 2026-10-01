// Discarded-query lock for HOME.
//
// HOME fetched the month summary as `const { data: _monthSummary } =
// useGetTransactionSummary(...)` and never read it (finding f9c4c30a6259):
// a network request on every HOME mount whose result went nowhere. The
// underscore was the tell — it silenced the unused-variable warning that
// would otherwise have caught it.
//
// What this locks: no `data: _name` destructure in MobileHome.tsx. A query
// whose result is not used should not be made.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "components/mobile/MobileHome.tsx");

describe("MobileHome makes no query whose data it discards", () => {
  it("has no `data: _name` destructure", () => {
    const sf = ts.createSourceFile(PATH, readFileSync(PATH, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const discarded: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isBindingElement(node) &&
        node.propertyName?.getText(sf) === "data" &&
        node.name.getText(sf).startsWith("_")
      ) {
        discarded.push(`${node.name.getText(sf)} at line ${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(discarded).toEqual([]);
  });
});
