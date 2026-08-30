import { describe, it, expect } from "vitest";
import { deriveInitials, deriveTone } from "./PhoneEntityRow";

// PhoneEntityRow is the primitive every entity list on the phone will
// use. deriveInitials and deriveTone are pure, deterministic, and the
// glyph is what enforces Amendment :83 — locking them prevents a silent
// regression that would show a wall of blanks and identical tints
// without failing any typecheck or route lock.

describe("deriveInitials", () => {
  it("returns the first letter of each of the first two words, uppercased", () => {
    expect(deriveInitials("Alex Chen")).toBe("AC");
    expect(deriveInitials("priya nair")).toBe("PN");
  });

  it("caps at two letters even when the name has more words", () => {
    expect(deriveInitials("Bank of America Corporation")).toBe("BO");
  });

  it("returns the first letter for a single word", () => {
    expect(deriveInitials("Monzo")).toBe("M");
  });

  it("collapses runs of whitespace before splitting", () => {
    expect(deriveInitials("  Tesco   Metro  ")).toBe("TM");
  });

  it("returns '?' for empty or whitespace-only input", () => {
    expect(deriveInitials("")).toBe("?");
    expect(deriveInitials("   ")).toBe("?");
  });

  it("preserves the first character for a symbol-led name rather than falling through to '?'", () => {
    // e.g. "*STARBUCKS" from a card processor string, or an emoji-prefixed
    // custom account name — better to show something than a literal '?'
    expect(deriveInitials("*Starbucks")).toBe("*");
  });
});

describe("deriveTone", () => {
  const PALETTE = [
    "var(--ft-blue)",
    "var(--ft-cyan)",
    "var(--ft-amber)",
    "var(--ft-green)",
    "var(--ft-accent)",
  ] as const;

  it("returns a value from the fixed five-token palette", () => {
    for (const name of ["Monzo", "Tesco", "Priya Nair", "Wise", "Vanguard", "?"]) {
      expect(PALETTE).toContain(deriveTone(name));
    }
  });

  it("never returns --ft-red (reserved for negative amounts)", () => {
    // Try enough distinct names that at least one would land on red
    // under a 6-slot palette; asserting it never appears is what locks
    // the "hue reserved for sign" contract.
    for (let i = 0; i < 200; i++) {
      expect(deriveTone(`Merchant ${i}`)).not.toBe("var(--ft-red)");
    }
  });

  it("is deterministic — same input, same tone across calls", () => {
    expect(deriveTone("Tesco")).toBe(deriveTone("Tesco"));
    expect(deriveTone("Alex Chen")).toBe(deriveTone("Alex Chen"));
  });

  it("returns a stable default for empty input rather than throwing", () => {
    expect(PALETTE).toContain(deriveTone(""));
    expect(PALETTE).toContain(deriveTone("   "));
  });
});
