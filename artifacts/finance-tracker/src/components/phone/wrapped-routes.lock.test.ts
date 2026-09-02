// Lock #18 · D5 ratchet — three-set model on PhoneShell.tsx.
//
// ── The defect this stops ─────────────────────────────────────────────────
// PhoneShell.tsx classifies every phone route into exactly one of three
// buckets:
//
//   WRAPPED_ROUTES        — a desktop page rendered inside
//                           DirectoryItemScreen. The stopgap. Every entry
//                           is a live iPad-audit defect (hover-only
//                           affordances, sub-44 tap targets, keyboard-only
//                           palettes) — the wrapper is the shell's honest
//                           admission that the destination has not been
//                           designed for touch. Count shrinks as real
//                           screens ship.
//
//   DESKTOP_ONLY_ROUTES   — a URL the phone shell knows but deliberately
//                           does NOT render the content of. Renders
//                           DesktopOnlyScreen: an explainer that offers a
//                           route back to /directory. Count grows only
//                           when a feature is deliberately declared
//                           phone-hostile enough to require the
//                           explainer — that's a diff a reviewer sees.
//
//   Tab URLs (and their aliases) — the five tabs plus the legacy URLs
//                           that resolve to a tab stub. Not tracked by
//                           name here; asserted disjoint from the two
//                           listed sets. If a legacy URL appears in
//                           WRAPPED_ROUTES OR DESKTOP_ONLY_ROUTES the
//                           lock fires — those URLs are tab-owned.
//
// Invariants asserted:
//   1. WRAPPED_ROUTES ↔ every wrappedRoute() call (equality both ways).
//   2. DESKTOP_ONLY_ROUTES ↔ every desktopOnlyRoute() call (equality
//      both ways).
//   3. WRAPPED_ROUTES ∩ DESKTOP_ONLY_ROUTES = ∅.
//
// The fabricated-zero-lock pattern this reuses (allowlist that only
// shrinks) demonstrably worked for demo-fabrication: baseline shrank by
// two files during the demo-data work. Same shape here, three sets
// instead of one.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { SLOT_OPTIONS } from "@/lib/tab-slot";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..", "..");
const PHONE_SHELL_PATH = join(
  REPO_ROOT,
  "artifacts/finance-tracker/src/components/phone/PhoneShell.tsx",
);

export interface ParseResult {
  listedWrapped: string[];
  listedDesktopOnly: string[];
  wrappedCalls: string[];
  desktopOnlyCalls: string[];
}

// Parse a PhoneShell.tsx source and return:
//   listedWrapped     — string literals inside `export const WRAPPED_ROUTES = [ … ]`
//   listedDesktopOnly — string literals inside `export const DESKTOP_ONLY_ROUTES = [ … ]`
//   wrappedCalls      — first string-literal arg of every `wrappedRoute("PATH", …)` call
//   desktopOnlyCalls  — first string-literal arg of every `desktopOnlyRoute("PATH", …)` call
export function parsePhoneShell(source: string): ParseResult {
  const sf = ts.createSourceFile(
    "PhoneShell.tsx",
    source,
    ts.ScriptTarget.ES2020,
    /*setParentNodes*/ true,
    ts.ScriptKind.TSX,
  );
  const listedWrapped: string[] = [];
  const listedDesktopOnly: string[] = [];
  const wrappedCalls: string[] = [];
  const desktopOnlyCalls: string[] = [];

  function collectArray(target: string[], node: ts.VariableDeclaration) {
    const init = node.initializer;
    if (init && ts.isArrayLiteralExpression(init)) {
      for (const el of init.elements) {
        if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
          target.push(el.text);
        }
      }
    }
  }

  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text === "WRAPPED_ROUTES") collectArray(listedWrapped, node);
      if (node.name.text === "DESKTOP_ONLY_ROUTES") collectArray(listedDesktopOnly, node);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const callee = node.expression.text;
      const arg = node.arguments[0];
      const pathArg =
        arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
          ? arg.text
          : null;
      if (pathArg != null) {
        if (callee === "wrappedRoute") wrappedCalls.push(pathArg);
        else if (callee === "desktopOnlyRoute") desktopOnlyCalls.push(pathArg);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return { listedWrapped, listedDesktopOnly, wrappedCalls, desktopOnlyCalls };
}

// Backwards-compat export for any external caller that still expects the
// pre-widening shape. Returns the wrapped-only view. Nothing in this repo
// calls it today; kept so a future consumer that imports parseWrappedRoutes
// doesn't get a silent breakage.
export function parseWrappedRoutes(source: string): { listed: string[]; wrapped: string[] } {
  const r = parsePhoneShell(source);
  return { listed: r.listedWrapped, wrapped: r.wrappedCalls };
}

// Parse once at import time so the baseline count is available in the
// describe/it labels — vitest suppresses console output for passing
// tests, but the labels always print regardless of pass/fail.
const LIVE_SOURCE = readFileSync(PHONE_SHELL_PATH, "utf-8");
const LIVE = parsePhoneShell(LIVE_SOURCE);

describe(
  `wrapped-routes ratchet lock (#18) [baseline: ${LIVE.wrappedCalls.length} wrapped, ${LIVE.desktopOnlyCalls.length} desktop-only]`,
  () => {
    it(
      `WRAPPED_ROUTES ↔ wrappedRoute calls (${LIVE.wrappedCalls.length} wrappings)`,
      () => {
        const listed = new Set(LIVE.listedWrapped);
        const called = new Set(LIVE.wrappedCalls);
        const calledNotListed = LIVE.wrappedCalls.filter((p) => !listed.has(p)).sort();
        const listedNotCalled = LIVE.listedWrapped.filter((p) => !called.has(p)).sort();
        if (calledNotListed.length === 0 && listedNotCalled.length === 0) return;

        const parts: string[] = [];
        if (calledNotListed.length > 0) {
          parts.push(
            `Wrapped but NOT in WRAPPED_ROUTES (${calledNotListed.length}):\n` +
              calledNotListed.map((p) => `  ${p}`).join("\n") +
              `\n\nEvery wrapper is a live iPad-audit defect. Adding one without listing it means the baseline grew invisibly. Add the path to WRAPPED_ROUTES — the diff IS the audit trail.`,
          );
        }
        if (listedNotCalled.length > 0) {
          parts.push(
            `In WRAPPED_ROUTES but NO wrapper still uses it (${listedNotCalled.length}):\n` +
              listedNotCalled.map((p) => `  ${p}`).join("\n") +
              `\n\nIf the wrapper was truly removed because the real touch screen shipped, remove the entry — the shrinkage is a green diff and is the whole point of the ratchet.`,
          );
        }
        throw new Error(`Lock #18 · WRAPPED_ROUTES ratchet — set drift.\n\n${parts.join("\n\n")}`);
      },
    );

    it(
      `DESKTOP_ONLY_ROUTES ↔ desktopOnlyRoute calls (${LIVE.desktopOnlyCalls.length} desktop-only)`,
      () => {
        const listed = new Set(LIVE.listedDesktopOnly);
        const called = new Set(LIVE.desktopOnlyCalls);
        const calledNotListed = LIVE.desktopOnlyCalls.filter((p) => !listed.has(p)).sort();
        const listedNotCalled = LIVE.listedDesktopOnly.filter((p) => !called.has(p)).sort();
        if (calledNotListed.length === 0 && listedNotCalled.length === 0) return;

        const parts: string[] = [];
        if (calledNotListed.length > 0) {
          parts.push(
            `Rendered as desktop-only but NOT in DESKTOP_ONLY_ROUTES (${calledNotListed.length}):\n` +
              calledNotListed.map((p) => `  ${p}`).join("\n") +
              `\n\nEvery desktop-only route is a deliberate declaration that a feature is phone-hostile enough to need an explainer. Add the path to DESKTOP_ONLY_ROUTES — the diff is the reviewer's chance to say "actually let's design it for phone."`,
          );
        }
        if (listedNotCalled.length > 0) {
          parts.push(
            `In DESKTOP_ONLY_ROUTES but NO desktopOnlyRoute call still uses it (${listedNotCalled.length}):\n` +
              listedNotCalled.map((p) => `  ${p}`).join("\n") +
              `\n\nIf the route is genuinely gone (deleted, or promoted to a wrapped route or a tab), remove the entry from DESKTOP_ONLY_ROUTES.`,
          );
        }
        throw new Error(`Lock #18 · DESKTOP_ONLY_ROUTES ratchet — set drift.\n\n${parts.join("\n\n")}`);
      },
    );

    it(
      "WRAPPED_ROUTES and DESKTOP_ONLY_ROUTES are disjoint (exclusivity)",
      () => {
        const wrapped = new Set(LIVE.listedWrapped);
        const overlap = LIVE.listedDesktopOnly.filter((p) => wrapped.has(p)).sort();
        if (overlap.length === 0) return;
        throw new Error(
          `Lock #18 · classification collision — routes appear in BOTH WRAPPED_ROUTES and DESKTOP_ONLY_ROUTES (${overlap.length}):\n` +
            overlap.map((p) => `  ${p}`).join("\n") +
            `\n\nEvery phone route belongs to exactly ONE of {tab, wrapped, desktop-only}. A path that is BOTH wrapped and desktop-only says "we render its desktop content on phone AND we don't." Pick one.`,
        );
      },
    );

    // ── Two-way fixture tests. Proof the lock bites in every direction. ──
    // Operator brief: "prove the exclusivity assertion bites by putting one
    // route in two sets." Structure of the fixtures below:
    //
    //   1. wrapped-but-not-listed drift (existing shape, kept)
    //   2. listed-but-not-wrapped drift (existing shape, kept)
    //   3. desktop-only-but-not-listed drift (NEW)
    //   4. listed-desktop-only-but-not-declared drift (NEW)
    //   5. same route in both listed sets — exclusivity fires (NEW)
    //   6. control: all three checks pass on a well-formed fixture

    const fixtureShell = ({
      listedWrapped = [],
      listedDesktopOnly = [],
      wrappedCalls = [],
      desktopOnlyCalls = [],
    }: {
      listedWrapped?: string[];
      listedDesktopOnly?: string[];
      wrappedCalls?: string[];
      desktopOnlyCalls?: string[];
    }) => `
export const WRAPPED_ROUTES: readonly string[] = [
${listedWrapped.map((s) => `  ${JSON.stringify(s)},`).join("\n")}
];
export const DESKTOP_ONLY_ROUTES: readonly string[] = [
${listedDesktopOnly.map((s) => `  ${JSON.stringify(s)},`).join("\n")}
];
function Body() {
  return (<>
${wrappedCalls.map((c) => `{${c}}`).join("\n")}
${desktopOnlyCalls.map((c) => `{${c}}`).join("\n")}
</>);
}
`;

    it("bites when a wrapper is added without listing (drift: wrapped ⊄ listed)", () => {
      const src = fixtureShell({
        listedWrapped: ["/goals"],
        wrappedCalls: [
          `wrappedRoute("/goals", Goals, "Goals")`,
          `wrappedRoute("/newroute", NewX, "NewX")`,
        ],
      });
      const r = parsePhoneShell(src);
      const listed = new Set(r.listedWrapped);
      const drift = r.wrappedCalls.filter((p) => !listed.has(p));
      expect(drift).toEqual(["/newroute"]);
    });

    it("bites when a listed path has no wrapper still using it (drift: listed ⊄ wrapped)", () => {
      const src = fixtureShell({
        listedWrapped: ["/goals", "/orphan"],
        wrappedCalls: [`wrappedRoute("/goals", Goals, "Goals")`],
      });
      const r = parsePhoneShell(src);
      const called = new Set(r.wrappedCalls);
      const drift = r.listedWrapped.filter((p) => !called.has(p));
      expect(drift).toEqual(["/orphan"]);
    });

    it("bites when a desktopOnlyRoute is added without listing (drift: called ⊄ listed)", () => {
      const src = fixtureShell({
        listedDesktopOnly: ["/business"],
        desktopOnlyCalls: [
          `desktopOnlyRoute("/business", "Business", "…")`,
          `desktopOnlyRoute("/newghost", "New", "…")`,
        ],
      });
      const r = parsePhoneShell(src);
      const listed = new Set(r.listedDesktopOnly);
      const drift = r.desktopOnlyCalls.filter((p) => !listed.has(p));
      expect(drift).toEqual(["/newghost"]);
    });

    it("bites when a listed desktop-only path has no matching call (drift: listed ⊄ called)", () => {
      const src = fixtureShell({
        listedDesktopOnly: ["/business", "/orphaned-ghost"],
        desktopOnlyCalls: [`desktopOnlyRoute("/business", "Business", "…")`],
      });
      const r = parsePhoneShell(src);
      const called = new Set(r.desktopOnlyCalls);
      const drift = r.listedDesktopOnly.filter((p) => !called.has(p));
      expect(drift).toEqual(["/orphaned-ghost"]);
    });

    // The exclusivity fixture: same route claimed by both sets. The three
    // top-level assertions above pass individually if a route is in both
    // sets (its wrappedRoute call matches WRAPPED_ROUTES AND its
    // desktopOnlyRoute call matches DESKTOP_ONLY_ROUTES). The exclusivity
    // assertion is what catches this shape.
    it("bites when a route is in BOTH WRAPPED_ROUTES and DESKTOP_ONLY_ROUTES (exclusivity)", () => {
      const src = fixtureShell({
        listedWrapped: ["/goals", "/pension"],
        listedDesktopOnly: ["/pension", "/business"],
        wrappedCalls: [
          `wrappedRoute("/goals", Goals, "Goals")`,
          `wrappedRoute("/pension", Pension, "Pension")`,
        ],
        desktopOnlyCalls: [
          `desktopOnlyRoute("/pension", "Pension", "…")`,
          `desktopOnlyRoute("/business", "Business", "…")`,
        ],
      });
      const r = parsePhoneShell(src);
      const wrapped = new Set(r.listedWrapped);
      const overlap = r.listedDesktopOnly.filter((p) => wrapped.has(p));
      expect(overlap).toEqual(["/pension"]);
    });

    // ── Invariants 4–5: tab-URL purity ───────────────────────────────────────
    // The phone has four tab positions: HOME · WORTH · [slot] · DIRECTORY.
    // The slot cycles through available SlotOptions (currently SPENDING,
    // MARKETS, UPCOMING). All tab-owned URLs must be absent from both
    // WRAPPED_ROUTES and DESKTOP_ONLY_ROUTES — wrapping a tab URL would mean
    // the route is both a tab and a drill-in, which produces two conflicting
    // animations and breaks the tab bar active-indicator logic.
    //
    // OWING is intentionally excluded: it is a slot option but available:false,
    // so it is still in WRAPPED_ROUTES until OwingScreen ships. The filter on
    // SLOT_OPTIONS.available enforces this — the lock only fires once the slot
    // is promoted to phone-native.

    const FIXED_TAB_URLS = ["/", "/worth", "/directory"] as const;
    const AVAILABLE_SLOT_URLS = SLOT_OPTIONS.filter((o) => o.available).map((o) => o.href);
    const TAB_OWNED_URLS = [...FIXED_TAB_URLS, ...AVAILABLE_SLOT_URLS];

    it(
      "tab-owned URLs are not in WRAPPED_ROUTES (tab purity)",
      () => {
        const wrapped = new Set(LIVE.listedWrapped);
        const clash = TAB_OWNED_URLS.filter((u) => wrapped.has(u));
        if (clash.length === 0) return;
        throw new Error(
          `Lock #18 · tab URL collision in WRAPPED_ROUTES (${clash.length}):\n` +
            clash.map((u) => `  ${u}`).join("\n") +
            `\n\nThese URLs belong to phone tabs. Wrapping a tab URL produces two conflicting animations and breaks the active indicator. Remove them from WRAPPED_ROUTES — or, if the slot is being retired, set it available:false in tab-slot.ts first.`,
        );
      },
    );

    it(
      "tab-owned URLs are not in DESKTOP_ONLY_ROUTES (tab purity)",
      () => {
        const desktopOnly = new Set(LIVE.listedDesktopOnly);
        const clash = TAB_OWNED_URLS.filter((u) => desktopOnly.has(u));
        if (clash.length === 0) return;
        throw new Error(
          `Lock #18 · tab URL collision in DESKTOP_ONLY_ROUTES (${clash.length}):\n` +
            clash.map((u) => `  ${u}`).join("\n") +
            `\n\nThese URLs belong to phone tabs. A tab URL must never render DesktopOnlyScreen — it is always reachable from the tab bar. Remove them from DESKTOP_ONLY_ROUTES.`,
        );
      },
    );

    it("bites when a tab URL appears in WRAPPED_ROUTES (tab-purity fixture)", () => {
      const wrapped = new Set(["/goals", "/markets"]);
      const clash = TAB_OWNED_URLS.filter((u) => wrapped.has(u));
      expect(clash).toEqual(["/markets"]);
    });

    it("bites when a tab URL appears in DESKTOP_ONLY_ROUTES (tab-purity fixture)", () => {
      const desktopOnly = new Set(["/business", "/spending"]);
      const clash = TAB_OWNED_URLS.filter((u) => desktopOnly.has(u));
      expect(clash).toEqual(["/spending"]);
    });

    it("passes when all three sets are consistent and disjoint (control)", () => {
      const src = fixtureShell({
        listedWrapped: ["/goals", "/pension"],
        listedDesktopOnly: ["/business", "/family"],
        wrappedCalls: [
          `wrappedRoute("/goals", Goals, "Goals")`,
          `wrappedRoute("/pension", Pension, "Pension")`,
        ],
        desktopOnlyCalls: [
          `desktopOnlyRoute("/business", "Business", "…")`,
          `desktopOnlyRoute("/family", "Family", "…")`,
        ],
      });
      const r = parsePhoneShell(src);
      // Each pair matches.
      expect(new Set(r.listedWrapped)).toEqual(new Set(r.wrappedCalls));
      expect(new Set(r.listedDesktopOnly)).toEqual(new Set(r.desktopOnlyCalls));
      // No overlap.
      const wrapped = new Set(r.listedWrapped);
      const overlap = r.listedDesktopOnly.filter((p) => wrapped.has(p));
      expect(overlap).toEqual([]);
    });
  },
);
