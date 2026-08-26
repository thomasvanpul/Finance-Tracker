// Lock #18 · D5 ratchet — WRAPPED_ROUTES must equal the set of routes actually
// wrapped in PhoneShell.
//
// ── The specific defect this stops ─────────────────────────────────────────
// PhoneShell.tsx wraps desktop pages inside DirectoryItemScreen as a stopgap
// while each destination is designed for touch. Every wrapping is a live
// iPad-audit defect: hover-only affordances that are unreachable on touch,
// sub-44px tap targets, keyboard-only palettes, and so on. The 26 Aug
// iPad audit measured these across 25 desktop-fallthrough routes.
//
// The alternative — no wrapping — stalls the shell, because the shell
// unblocks everything. So wrapping is allowed. But the D5 lock as
// originally proposed (route ⊆ phone-shell) could not distinguish
// "resolved by a wrapper" from "resolved by a real screen", so the
// permitted end state was 22 desktop pages rendering on iPhones,
// certified. That's worse than today, because today the problem is at
// least visible.
//
// This lock closes the trap. WRAPPED_ROUTES in PhoneShell.tsx is the
// baseline: every string in it is a wrapping that exists, and every
// wrapping in the file has its path in the list. Adding a wrapper without
// listing it fails; removing a listed path while a wrapper still uses it
// also fails. A one-directional ratchet is not a ratchet.
//
// The count of wrapped routes prints on every run. It can only shrink
// (a wrapper removed because the real screen shipped) or explicitly
// grow via a diff to WRAPPED_ROUTES — no invisible expansion.
//
// This is the fabricated-zero-lock pattern (demo-fabrication.lock.test.ts)
// applied to a different debt: its allowlist demonstrably shrank by two
// files during the demo-data work.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..", "..");
const PHONE_SHELL_PATH = join(
  REPO_ROOT,
  "artifacts/finance-tracker/src/components/phone/PhoneShell.tsx",
);

export interface ParseResult {
  listed: string[];
  wrapped: string[];
}

// Parse a PhoneShell.tsx source and return:
//   listed   — string literals inside `export const WRAPPED_ROUTES: ...[] = [ ... ]`
//   wrapped  — first string-literal arg of every `wrappedRoute("PATH", ..., ...)` call
export function parseWrappedRoutes(source: string): ParseResult {
  const sf = ts.createSourceFile(
    "PhoneShell.tsx",
    source,
    ts.ScriptTarget.ES2020,
    /*setParentNodes*/ true,
    ts.ScriptKind.TSX,
  );
  const listed: string[] = [];
  const wrapped: string[] = [];

  function visit(node: ts.Node) {
    // WRAPPED_ROUTES declaration.
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "WRAPPED_ROUTES") {
      const init = node.initializer;
      if (init && ts.isArrayLiteralExpression(init)) {
        for (const el of init.elements) {
          if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
            listed.push(el.text);
          }
        }
      }
    }
    // wrappedRoute("...", ...) call.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "wrappedRoute"
    ) {
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
        wrapped.push(arg.text);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return { listed, wrapped };
}

// Parse once at import time so the baseline count is available in the
// describe/it labels — vitest suppresses console output for passing
// tests, but the labels always print regardless of pass/fail. Operator
// brief: "The count prints on every run." The label is where.
const LIVE_SOURCE = readFileSync(PHONE_SHELL_PATH, "utf-8");
const LIVE = parseWrappedRoutes(LIVE_SOURCE);

describe(`wrapped-routes ratchet lock (#18) [baseline: ${LIVE.wrapped.length} wrapped, ${LIVE.listed.length} listed]`, () => {
  it(`WRAPPED_ROUTES equals the set of routes actually wrapped in PhoneShell (${LIVE.wrapped.length} wrappings)`, () => {
    const { listed, wrapped } = LIVE;
    const listedSet = new Set(listed);
    const wrappedSet = new Set(wrapped);

    const wrappedNotListed = wrapped.filter((p) => !listedSet.has(p)).sort();
    const listedNotWrapped = listed.filter((p) => !wrappedSet.has(p)).sort();

    if (wrappedNotListed.length === 0 && listedNotWrapped.length === 0) return;

    const parts: string[] = [];
    if (wrappedNotListed.length > 0) {
      parts.push(
        `Wrapped but NOT in WRAPPED_ROUTES (${wrappedNotListed.length}):\n` +
          wrappedNotListed.map((p) => `  ${p}`).join("\n") +
          `\n\nEvery wrapper is a live iPad-audit defect (hover-only affordances, sub-44 tap targets, keyboard-only palettes on wrapped pages). Adding one without listing it means the baseline count grew invisibly. Add the path to WRAPPED_ROUTES in components/phone/PhoneShell.tsx — the diff IS the audit trail.`,
      );
    }
    if (listedNotWrapped.length > 0) {
      parts.push(
        `In WRAPPED_ROUTES but NO wrapper still uses it (${listedNotWrapped.length}):\n` +
          listedNotWrapped.map((p) => `  ${p}`).join("\n") +
          `\n\nA path in the baseline is a wrapping that exists. If the wrapper was truly removed because the real touch screen shipped, remove the entry from WRAPPED_ROUTES too — the shrinkage is a green diff and is the whole point of the ratchet. Otherwise a wrapper was renamed or moved out from under the list — fix the wrapping instead.`,
      );
    }
    throw new Error(`Lock #18 · WRAPPED_ROUTES ratchet — set drift.\n\n${parts.join("\n\n")}`);
  });

  // Two-way fixture tests. The operator's brief: "Prove it bites BOTH
  // ways: adding an unlisted wrapper must fail, and removing a route
  // from WRAPPED_ROUTES while it is still wrapped must also fail. A
  // one-directional ratchet is not a ratchet."
  //
  // These exercise parseWrappedRoutes on synthetic minimal shells and
  // assert the diff-set the top-level check compares — so a regression
  // in the parser (or in the comparison logic) also fails them.

  const fixtureShell = ({ listed, wrappedCalls }: { listed: string[]; wrappedCalls: string[] }) => `
export const WRAPPED_ROUTES: readonly string[] = [
${listed.map((s) => `  ${JSON.stringify(s)},`).join("\n")}
];
function Body() {
  return (<>${wrappedCalls.map((c) => `{${c}}`).join("\n")}</>);
}
`;

  it("bites when a wrapper is added without listing (drift: wrapped ⊄ listed)", () => {
    const src = fixtureShell({
      listed: ["/goals", "/pension"],
      wrappedCalls: [
        `wrappedRoute("/goals", Goals, "Goals")`,
        `wrappedRoute("/pension", Pension, "Pension")`,
        `wrappedRoute("/newroute", NewX, "NewX")`,
      ],
    });
    const { listed, wrapped } = parseWrappedRoutes(src);
    const listedSet = new Set(listed);
    const wrappedNotListed = wrapped.filter((p) => !listedSet.has(p));
    expect(wrappedNotListed).toEqual(["/newroute"]);
  });

  it("bites when a listed path has no wrapper still using it (drift: listed ⊄ wrapped)", () => {
    const src = fixtureShell({
      listed: ["/goals", "/pension", "/orphan"],
      wrappedCalls: [
        `wrappedRoute("/goals", Goals, "Goals")`,
        `wrappedRoute("/pension", Pension, "Pension")`,
      ],
    });
    const { listed, wrapped } = parseWrappedRoutes(src);
    const wrappedSet = new Set(wrapped);
    const listedNotWrapped = listed.filter((p) => !wrappedSet.has(p));
    expect(listedNotWrapped).toEqual(["/orphan"]);
  });

  it("passes when the two sets match exactly (control)", () => {
    const src = fixtureShell({
      listed: ["/goals", "/pension"],
      wrappedCalls: [
        `wrappedRoute("/goals", Goals, "Goals")`,
        `wrappedRoute("/pension", Pension, "Pension")`,
      ],
    });
    const { listed, wrapped } = parseWrappedRoutes(src);
    expect(new Set(listed)).toEqual(new Set(wrapped));
  });
});
