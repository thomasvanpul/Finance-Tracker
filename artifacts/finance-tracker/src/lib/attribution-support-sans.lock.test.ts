// Attribution support-sentence lock (DESIGN.md §10).
//
// The line under the change-attribution finding — "£0 of £760 — the whole
// of the rest is currency rates" — is a sentence that contains figures, not
// a figure. §10: sentences are sans. It was drawn mono on the phone WORTH
// block and in the desktop top region (finding 5b584e056530).
//
// What this locks: no JSX element whose child is `finding.support` carries
// the `mono` attribute, in either file that renders it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["components/change-attribution.tsx", "components/proto/top-region.tsx"];

function monoSupportSites(rel: string): { found: number; mono: number[] } {
  const path = join(SRC, rel);
  const sf = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found = 0;
  const mono: number[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) {
      const rendersSupport = node.children.some(
        (c) => ts.isJsxExpression(c) && c.expression != null && /finding\.support$/.test(c.expression.getText(sf)),
      );
      if (rendersSupport) {
        found += 1;
        const hasMono = node.openingElement.attributes.properties.some(
          (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "mono",
        );
        if (hasMono) mono.push(sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { found, mono };
}

describe("attribution support sentence is sans", () => {
  for (const rel of FILES) {
    it(`${rel} renders finding.support without mono`, () => {
      const { found, mono } = monoSupportSites(rel);
      expect(found).toBeGreaterThan(0);
      expect(mono).toEqual([]);
    });
  }
});
