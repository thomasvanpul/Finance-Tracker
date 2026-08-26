// Source-level assertion for the G11 disclosure contract on the pension
// page. The 7% growth-rate default is a legitimate model assumption ONLY
// IF the user can see it at the point the Projected Pot number renders.
// Remove the "assumes N%/yr growth" pill from the Projected Pot caption
// and this test fails; the allowlist entry for pension.tsx:104 in
// demo-fabrication.lock.test.ts then silently becomes a lie about what
// the code does. This test is what stops that.
//
// Source-level rather than React-mounting because this workspace does
// not yet have @testing-library/react installed and pulling it in three
// weeks before App Store submission is not the right trade. The lock
// files in this repo (ai-context.leak-lock, fabricated-zero-lock, and
// demo-fabrication.lock) all use the same read-the-file assertion
// pattern; this test extends the same pattern.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PENSION_SRC = readFileSync(join(dirname(__filename), "pension.tsx"), "utf-8");

// Grab the KpiBar component body — from `function KpiBar` to the next
// top-level function declaration. The Projected Pot caption + growth-rate
// disclosure both live inside this component.
function kpiBarBody(): string {
  const start = PENSION_SRC.indexOf("function KpiBar");
  if (start === -1) throw new Error("KpiBar function not found in pension.tsx — refactor drift, please update the disclosure test");
  const rest = PENSION_SRC.slice(start);
  const nextFn = rest.slice(1).search(/\n(?:function|export function) /);
  return nextFn === -1 ? rest : rest.slice(0, nextFn);
}

describe("pension · growth-rate disclosure contract (G11)", () => {
  it("KpiBar renders the growth rate on the Projected Pot caption", () => {
    const body = kpiBarBody();

    // Anchor: the Projected Pot cell label must still exist. If the
    // whole hero was removed, the disclosure has nothing to hang from
    // and this catches that too.
    expect(body).toMatch(/Projected Pot/);

    // The disclosure text and its clickable anchor. Together these
    // encode: (a) the growth rate appears, (b) it is presented as an
    // assumption not a fact, (c) there is a testable hook so the pill
    // can't silently drift to a non-clickable span.
    expect(body).toMatch(/assumes \{growthRate\}%\/yr growth/);
    expect(body).toMatch(/data-testid="growth-rate-disclosure"/);
  });

  it("the disclosure is wired to focus the growth-rate input", () => {
    // The onFocusGrowthRate handler on the KpiBar call site must scroll
    // to and focus the specific input identified by GROWTH_RATE_INPUT_ID.
    // Without this the pill discloses the number but "change it" is not
    // one interaction away from the hero, which fails the contract.
    expect(PENSION_SRC).toMatch(/const GROWTH_RATE_INPUT_ID = "pension-growth-rate-input"/);
    expect(PENSION_SRC).toMatch(/id=\{GROWTH_RATE_INPUT_ID\}/);
    expect(PENSION_SRC).toMatch(/onFocusGrowthRate=\{\(\) => \{[^}]*getElementById\(GROWTH_RATE_INPUT_ID\)/s);
  });

  it("PensionHealthBlock footer states the rate value, not just that one exists", () => {
    // Previous footer text ("Assumes constant growth rate to retirement")
    // flagged that an assumption existed but did not name it. Per the
    // G11 disclosure contract, the value must appear.
    const start = PENSION_SRC.indexOf("function PensionHealthBlock");
    if (start === -1) throw new Error("PensionHealthBlock function not found");
    const body = PENSION_SRC.slice(start, start + 12_000);
    expect(body).toMatch(/Assumes \{growthRate\}%\/yr growth to retirement/);
    // And the phrase that omitted the value has to be gone.
    expect(body).not.toMatch(/Assumes constant growth rate to retirement/);
  });
});
