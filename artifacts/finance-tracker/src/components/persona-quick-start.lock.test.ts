// Source-level lock: QUICK START's pressable controls speak the accent.
//
// DESIGN.md §11: "If a control is pressable, selected, or current, it is
// --ft-accent", amber carries warning, and `rgba(244,162,30,…)` is a dead
// previous accent that changes on none of the themes. The GO buttons and
// step numbers here were amber with hardcoded gold borders (findings
// ebd88264ba73 and 5ccc4abaa0e0).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "persona-quick-start.tsx"),
  "utf8",
);

describe("persona-quick-start colour lock", () => {
  it("carries no hardcoded rgba(244,162,30,…) dead accent", () => {
    expect(SOURCE.match(/rgba\(\s*244\s*,\s*162\s*,\s*30/g) ?? []).toEqual([]);
  });

});
