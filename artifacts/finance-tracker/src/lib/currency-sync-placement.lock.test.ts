// Currency-sync placement lock.
//
// One assertion, one thing that must stay true: <CurrencySync /> is
// mounted inside App()'s return JSX subtree — NOT inside Router(),
// NOT inside Layout, NOT inside PhoneShell.
//
// Why: on 30 Aug the sync effect lived at layout.tsx:1245. PhoneShell
// never renders Layout, so setBaseCurrency was never called on phone,
// so getBaseCurrency() stayed null for every wrapped route, so every
// base-currency figure rendered "—" permanently. Fixed by moving the
// effect into <CurrencySync /> mounted at App level (commit 2eed990).
//
// Router() contains the `if (isMobile) return <PhoneShell />` branch.
// Anything mounted inside Router() is subject to that branch —
// CurrencySync inside Router() below the branch fires on desktop only;
// CurrencySync inside Router() above the branch fires everywhere. To
// avoid depending on above-vs-below-a-line-number reasoning, the
// invariant simplifies to: mount CurrencySync in App()'s tree, which
// runs before Router() is even entered.
//
// The residual risk this doesn't lock: first-ever visit, empty
// localStorage, sync query in flight — "—" is rendered briefly. That
// dash is honest ("we don't know yet"), not a defect. This lock does
// not attempt to catch it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");
const APP_PATH = join(REPO_ROOT, "artifacts/finance-tracker/src/App.tsx");

// Returns true iff <CurrencySync /> is found somewhere inside the JSX
// subtree of a top-level `function App()` declaration. Nested function
// declarations (Router, DefaultPageRedirector, etc.) are walked past —
// their JSX is a separate render subtree that App() itself never
// mounts directly.
export function currencySyncInAppReturn(source: string): boolean {
  const sf = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  let found = false;

  ts.forEachChild(sf, (topNode) => {
    if (!ts.isFunctionDeclaration(topNode) || topNode.name?.text !== "App") return;
    (function walk(node: ts.Node) {
      // Descending into a nested function declaration (e.g. Router)
      // means we're leaving App's own return subtree. Skip it.
      if (node !== topNode && ts.isFunctionDeclaration(node)) return;
      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        ts.isIdentifier(node.tagName) &&
        node.tagName.text === "CurrencySync"
      ) {
        found = true;
      }
      ts.forEachChild(node, walk);
    })(topNode);
  });
  return found;
}

describe("currency-sync placement lock (App.tsx)", () => {
  it("<CurrencySync /> is mounted in App()'s return JSX subtree", () => {
    const source = readFileSync(APP_PATH, "utf-8");
    expect(currencySyncInAppReturn(source)).toBe(true);
  });

  // Prove-it-bites — synthetic App.tsx sources exercising every failure
  // mode + a control.

  it("bites when CurrencySync is missing from App.tsx entirely", () => {
    const src = `function App() { return <><Router /></>; }`;
    expect(currencySyncInAppReturn(src)).toBe(false);
  });

  it("bites when CurrencySync is mounted only inside Router() (below the isMobile branch)", () => {
    const src = `
      function App() { return <><Router /></>; }
      function Router() {
        if (isMobile) return <PhoneShell />;
        return <><CurrencySync /><Layout /></>;
      }
    `;
    expect(currencySyncInAppReturn(src)).toBe(false);
  });

  it("passes when CurrencySync is nested in App()'s tree (control — matches the current shape)", () => {
    const src = `
      function App() {
        return (
          <AuthGate>
            <OnboardingGate>
              <WouterRouter>
                <CurrencySync />
                <Router />
              </WouterRouter>
            </OnboardingGate>
          </AuthGate>
        );
      }
      function Router() { return null; }
    `;
    expect(currencySyncInAppReturn(src)).toBe(true);
  });
});
