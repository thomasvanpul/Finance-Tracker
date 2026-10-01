// The Business P&L chart's Y axis divided every tick by 1,000 and rounded,
// so an account with £76.42 of expenses drew five ticks that all read
// "£0k" (finding 87c14c3cb00d). Reports already had the fix as a private
// helper; it now lives here and both charts use it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { formatAxisPounds } from "./axis-pounds";

describe("formatAxisPounds", () => {
  it("shows whole pounds below £1k, so small ticks stay distinct", () => {
    const ticks = [0, 20, 40, 60, 80].map(formatAxisPounds);
    expect(ticks).toEqual(["£0", "£20", "£40", "£60", "£80"]);
    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("shows thousands from £1k, one decimal below £10k", () => {
    expect(formatAxisPounds(1000)).toBe("£1k");
    expect(formatAxisPounds(2500)).toBe("£2.5k");
    expect(formatAxisPounds(12_000)).toBe("£12k");
  });

  it("puts a typographic minus before the £", () => {
    expect(formatAxisPounds(-300)).toBe("−£300");
    expect(formatAxisPounds(-1500)).toBe("−£1.5k");
  });
});

describe("Business P&L Y axis", () => {
  it("uses formatAxisPounds rather than a whole-£k formatter", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../pages/business.tsx"), "utf8");
    expect(src).not.toMatch(/\(v \/ 1000\)\.toFixed\(0\)\}k/);
    expect(src).toMatch(/tickFormatter=\{formatAxisPounds\}/);
  });
});
