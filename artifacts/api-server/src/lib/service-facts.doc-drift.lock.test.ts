// docs/OPERATIONS.md's service table is generated from service-facts.ts.
// Nothing stops someone editing either side alone, and a ceilings table that
// disagrees with the module the admin hub renders is worse than no table —
// two confident numbers, no way to tell which is current.
//
// This lock re-renders the table from the typed source and asserts the
// committed doc matches. If it fails the fix is:
//
//   pnpm --filter @workspace/api-server gen:service-facts
//
// and commit the result. Never edit this test to make a drifted doc pass.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDoc } from "./service-facts-doc";
import { SERVICE_FACTS } from "./service-facts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const DOC = join(REPO_ROOT, "docs", "OPERATIONS.md");

describe("service-facts ↔ OPERATIONS.md", () => {
  it("the committed doc matches what the typed source renders", () => {
    const current = readFileSync(DOC, "utf-8");
    expect(
      renderDoc(current),
      "docs/OPERATIONS.md is stale — run `pnpm --filter @workspace/api-server gen:service-facts`",
    ).toBe(current);
  });

  it("every stated ceiling carries the date it was checked", () => {
    // A stated fact without a date is indistinguishable from a guess, and the
    // hub renders these as though they were verified.
    for (const s of SERVICE_FACTS) {
      for (const c of s.ceilings) {
        if (c.source.kind === "stated") {
          expect(c.source.checkedOn, `${s.id} · ${c.label}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    }
  });

  it("every service carries a check date and a plan", () => {
    for (const s of SERVICE_FACTS) {
      expect(s.checkedOn, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.plan.length, s.id).toBeGreaterThan(0);
    }
  });

  it("keeps the launch blockers visible rather than letting them lapse", () => {
    // Yahoo has no commercial licence and Alpaca does not grant
    // redistribution. If either row loses its blocker the hub silently stops
    // saying so, which is how an unlicensed lane ends up shipped.
    const blocked = SERVICE_FACTS.filter((s) => s.launchBlocker !== null).map((s) => s.id);
    expect(blocked).toContain("yahoo");
    expect(blocked).toContain("alpaca");
  });
});
