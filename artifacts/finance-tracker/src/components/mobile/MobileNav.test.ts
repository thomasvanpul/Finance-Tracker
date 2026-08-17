// Persona → mobile bottom-nav tab-set. Slot 1 (HOME) and slots 4/5
// (MOVE/FIND) stay constant across every persona — they're the
// anchors. Slot 2 varies. Test locks:
//   - HOME + MOVE + FIND always present in expected positions
//   - Slot 2 for each persona is what we say it is
//   - The React component still consumes ONE component (no per-persona
//     fork) — this is enforced by tabSetForPersona returning a
//     FooterTabDef[] which the single MobileNav render iterates.

import { describe, it, expect } from "vitest";
import { tabSetForPersona } from "./MobileNav";

describe("tabSetForPersona — slot invariants", () => {
  it("slot 0 is HOME for every persona", () => {
    for (const p of ["market", "budget", "wealth", "social", "full"] as const) {
      expect(tabSetForPersona(p)[0]!.key).toBe("home");
    }
  });

  it("slots 2 and 3 are MOVE and FIND for every persona", () => {
    for (const p of ["market", "budget", "wealth", "social", "full"] as const) {
      const s = tabSetForPersona(p);
      expect(s[2]!.key).toBe("move");
      expect(s[3]!.key).toBe("find");
    }
  });
});

describe("tabSetForPersona — slot 2 varies", () => {
  it("market → PORTFOLIO in slot 2", () => {
    expect(tabSetForPersona("market")[1]!.key).toBe("portfolio");
    expect(tabSetForPersona("market")[1]!.route).toBe("/investments");
  });

  it("budget → MONTH in slot 2", () => {
    expect(tabSetForPersona("budget")[1]!.key).toBe("month");
    expect(tabSetForPersona("budget")[1]!.route).toBe("/upcoming");
  });

  it("wealth → GOALS in slot 2", () => {
    expect(tabSetForPersona("wealth")[1]!.key).toBe("goals");
    expect(tabSetForPersona("wealth")[1]!.route).toBe("/goals");
  });

  it("social → OWING in slot 2", () => {
    expect(tabSetForPersona("social")[1]!.key).toBe("owing");
    expect(tabSetForPersona("social")[1]!.route).toBe("/owing");
  });

  it("full → MONTH in slot 2 (default preserved)", () => {
    expect(tabSetForPersona("full")[1]!.key).toBe("month");
  });
});

describe("tabSetForPersona — matcher", () => {
  it("home matcher lights on / and empty string", () => {
    const home = tabSetForPersona("full")[0]!;
    expect(home.matches("/")).toBe(true);
    expect(home.matches("")).toBe(true);
    expect(home.matches("/accounts")).toBe(false);
  });

  it("market slot 2 lights on /investments", () => {
    const s2 = tabSetForPersona("market")[1]!;
    expect(s2.matches("/investments")).toBe(true);
    expect(s2.matches("/portfolio")).toBe(false);
  });
});
