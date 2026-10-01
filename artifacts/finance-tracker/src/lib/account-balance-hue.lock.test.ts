// Account balance hue lock.
//
// DESIGN.md §7 and the semantic ramp: green and red carry sign — green a
// gain, red a loss. A bank balance is a level, not a gain. The dashboard
// ACCOUNTS list painted every non-negative balance `--ft-green`
// (`isNeg ? red : green`), and its footer total the same, so green was on
// every row but a debt and encoded nothing (finding ccfb282d58b8,
// 2026-10-01). A balance is neutral; only a negative one takes red, and it
// carries its minus as well.
//
// What this locks: every `--ft-green` in widgets/accounts-summary.tsx is
// one of the listed uses, each of which is a direction rather than a level.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WIDGET = join(dirname(fileURLToPath(import.meta.url)), "..", "components", "widgets", "accounts-summary.tsx");

// Lines allowed to name --ft-green, each with the reason.
const ALLOWED: { pattern: RegExp; reason: string }[] = [
  { pattern: /label: "They Owe Me"/, reason: "money owed to the user is an inflow, a direction" },
  { pattern: /d\.owing\.netBase >= 0 \?/, reason: "net owing position is signed and carries its + glyph" },
  { pattern: /<WidgetShell title="Accounts"/, reason: "widget accent stripe, not a figure" },
];

describe("accounts-summary balance hue", () => {
  it("never paints a balance level green", () => {
    const lines = readFileSync(WIDGET, "utf8").split("\n");
    const offenders = lines
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => line.includes("--ft-green"))
      .filter(({ line }) => !ALLOWED.some(({ pattern }) => pattern.test(line)))
      .map(({ line, n }) => `accounts-summary.tsx:${n}: ${line.slice(0, 120)}`);
    expect(offenders).toEqual([]);
  });
});
