import { describe, it, expect } from "vitest";
import { splitInsight } from "@/lib/insight-split";

// The AI insights card leads with the figure (DESIGN.md §10). The model is
// asked for "<figure> — <clause>", but a model is not a contract: this
// covers what happens when it does not comply. The rule the tests defend is
// that a figure is only ever shown when the model actually supplied one —
// the same rule as CLAUDE.md's "never show a number the API did not supply".
describe("splitInsight", () => {
  it("separates a leading figure from its clause", () => {
    expect(splitInsight("£412/mo — subscriptions, up 18% on last quarter"))
      .toEqual({ figure: "£412/mo", clause: "subscriptions, up 18% on last quarter" });
  });

  it("accepts a percentage or a bare count as the figure", () => {
    expect(splitInsight("18% — of spend is recurring").figure).toBe("18%");
    expect(splitInsight("7 — goals still unfunded").figure).toBe("7");
  });

  it("returns the whole line as prose when there is no separator", () => {
    const line = "Your subscriptions rose sharply this quarter";
    expect(splitInsight(line)).toEqual({ figure: null, clause: line });
  });

  it("does not promote a dashed sentence to a figure", () => {
    // An em dash mid-sentence is punctuation, not a delimiter. Without the
    // digit and length guards this would render "Spending is up" as a figure.
    const line = "Spending is up — mostly on eating out";
    expect(splitInsight(line)).toEqual({ figure: null, clause: line });
  });

  it("rejects a long head even when it contains a digit", () => {
    const line = "You spent 412 pounds on subscriptions — worth reviewing";
    expect(splitInsight(line).figure).toBeNull();
  });

  it("does not split on a leading separator", () => {
    const line = " — orphaned clause";
    expect(splitInsight(line).figure).toBeNull();
  });
});
