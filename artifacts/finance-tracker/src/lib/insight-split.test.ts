import { describe, it, expect } from "vitest";
import { splitInsight } from "@/lib/insight-split";

// The AI insights card leads with the figure (DESIGN.md §10), then the
// clause that says what it means, then one line of support. The model is
// asked for "<figure> — <clause> — <support>", but a model is not a
// contract: this covers what happens when it does not comply. The rule the
// tests defend is that a figure is only ever shown when the model actually
// supplied one — the same rule as CLAUDE.md's "never show a number the API
// did not supply" — and that a missing part is absent, never invented.
describe("splitInsight", () => {
  it("separates a leading figure from its clause", () => {
    expect(splitInsight("£412/mo — subscriptions, up 18% on last quarter"))
      .toEqual({ figure: "£412/mo", clause: "subscriptions, up 18% on last quarter", support: null });
  });

  it("accepts a percentage or a bare count as the figure", () => {
    expect(splitInsight("18% — of spend is recurring").figure).toBe("18%");
    expect(splitInsight("7 — goals still unfunded").figure).toBe("7");
  });

  it("returns the whole line as prose when there is no separator", () => {
    const line = "Your subscriptions rose sharply this quarter";
    expect(splitInsight(line)).toEqual({ figure: null, clause: line, support: null });
  });

  it("does not promote a dashed sentence to a figure", () => {
    // An em dash mid-sentence is punctuation, not a delimiter. Without the
    // digit and length guards this would render "Spending is up" as a figure.
    const line = "Spending is up — mostly on eating out";
    expect(splitInsight(line)).toEqual({ figure: null, clause: line, support: null });
  });

  it("rejects a long head even when it contains a digit", () => {
    const line = "You spent 412 pounds on subscriptions — worth reviewing";
    expect(splitInsight(line).figure).toBeNull();
  });

  it("does not split on a leading separator", () => {
    const line = " — orphaned clause";
    expect(splitInsight(line).figure).toBeNull();
  });

  // ── The third part, added 2026-09-08 with the three-across card ──────────

  it("separates figure, clause and support", () => {
    expect(splitInsight("£960 — none of it was you spending — all three moves are FX"))
      .toEqual({
        figure: "£960",
        clause: "none of it was you spending",
        support: "all three moves are FX",
      });
  });

  it("leaves support null when the model sent only two parts", () => {
    expect(splitInsight("22% — savings rate, below your 30% target").support).toBeNull();
  });

  it("keeps a fourth separator inside the support line rather than dropping it", () => {
    // Support is the last slot, so there is nothing after it to promote a
    // further separator into. Dropping the tail would lose data the model
    // supplied.
    expect(splitInsight("£412 — subscriptions are up — three renewals — same month").support)
      .toBe("three renewals — same month");
  });

  it("does not re-split a prose line that contains several dashes", () => {
    // The head fails the figure guard, so the line is prose. Cutting it at
    // the second dash would invent a structure the model did not write.
    const line = "Spending is up — mostly eating out — and travel";
    expect(splitInsight(line)).toEqual({ figure: null, clause: line, support: null });
  });
});
