// Lock: the amber tier of a green/amber/red scale uses var(--ft-amber), not #e3b341.
//
// #e3b341 is a fixed hex, so it ignores the theme: on `arctic` and the other
// light themes it sits on a pale surface at low contrast, while the green and
// red tiers beside it follow the theme. These files carry only three-tier
// scales whose other tiers are already tokens.
//
// Not covered here: components/investments/stat-drill-modal.tsx, whose amber
// is one step of a five-step scale. That scale moved to tokens together with a
// new --ft-orange and is locked by orange-token.lock.test.ts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = [
  "components/widgets/compact-tiles.tsx",
  "pages/goals.tsx",
];

describe("amber tier uses the theme token", () => {
  for (const file of FILES) {
    it(`${file} has no hardcoded #e3b341`, () => {
      const src = readFileSync(join(SRC_DIR, file), "utf8");
      const hits = src.split("\n").flatMap((line, i) =>
        /#e3b341/i.test(line) ? [`${file}:${i + 1}`] : [],
      );
      expect(hits).toEqual([]);
    });
  }
});
