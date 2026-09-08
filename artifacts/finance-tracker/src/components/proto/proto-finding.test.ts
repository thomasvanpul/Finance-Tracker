import { describe, it, expect } from "vitest";
import { protoFinding } from "@/components/proto/proto-finding";
import type { AttributionRow, AttributionView } from "@/lib/change-attribution-view";

// The finding is the one thing WHAT CHANGED has never said, and it is a
// sentence built out of ratios — which is exactly the shape that reads as
// correct while being wrong. These cover the readings that would mislead: a
// share rounded up to a claim it does not support, a concentration named
// where there is none, and the branch where spending IS the answer and the
// lead would otherwise deny it.

function row(over: Partial<AttributionRow> & Pick<AttributionRow, "kind" | "amountBase">): AttributionRow {
  return {
    label: over.label ?? "a row",
    detail: over.detail ?? "",
    drillHref: over.drillHref ?? "/",
    breakdown: over.breakdown ?? [],
    ...over,
  };
}

function ok(rows: AttributionRow[]): AttributionView {
  return { status: "ok", totalBase: rows.reduce((s, r) => s + r.amountBase, 0), windowLabel: "since 7 Sep", rows, warning: null };
}

describe("protoFinding", () => {
  it("says none of it was spending when there is no spend row, and names the account that concentrates the cause", () => {
    // The dev account on 2026-09-08, verbatim from /api/accounts/change-attribution.
    const found = protoFinding(ok([
      row({
        kind: "rate",
        amountBase: -875.9965,
        breakdown: [
          { label: "Flat, Kuala Lumpur", amountBase: -872.8866, drillHref: "/" },
          { label: "Maybank MYR", amountBase: -2.0333, drillHref: "/" },
          { label: "Wise EUR", amountBase: -1.0766, drillHref: "/" },
        ],
      }),
    ]));

    expect(found).not.toBeNull();
    expect(found?.lead).toBe("None of this was you spending.");
    expect(found?.cause).toBe("The exchange rate moved 100% of it, and Flat, Kuala Lumpur is 99.6% of that.");
  });

  it("does not round a 99.6% concentration up to 100%", () => {
    // The whole reason share() carries a decimal band. "100% of that" against
    // a true 99.6% is a different claim, not a tidier one.
    const found = protoFinding(ok([
      row({
        kind: "rate",
        amountBase: -1000,
        breakdown: [
          { label: "One", amountBase: -996, drillHref: "/" },
          { label: "Two", amountBase: -4, drillHref: "/" },
        ],
      }),
    ]));
    expect(found?.cause).toContain("99.6% of that");
  });

  it("names no account when the cause is genuinely spread", () => {
    const found = protoFinding(ok([
      row({
        kind: "rate",
        amountBase: -100,
        breakdown: [
          { label: "One", amountBase: -34, drillHref: "/" },
          { label: "Two", amountBase: -33, drillHref: "/" },
          { label: "Three", amountBase: -33, drillHref: "/" },
        ],
      }),
    ]));
    expect(found?.cause).toBe("The exchange rate moved 100% of it.");
  });

  it("does not deny spending when spending is what moved it", () => {
    const found = protoFinding(ok([
      row({ kind: "spend", amountBase: -800 }),
      row({ kind: "rate", amountBase: -200 }),
    ]));
    expect(found?.lead).toBe("This was mostly you spending, 80% of it.");
    expect(found?.cause).toBe("The exchange rate is the rest, 20%.");
  });

  it("quotes the spend share when spending is present but small", () => {
    const found = protoFinding(ok([
      row({ kind: "spend", amountBase: -50 }),
      row({ kind: "rate", amountBase: -950 }),
    ]));
    expect(found?.lead).toBe("Almost none of this was you spending, 5.0%.");
  });

  it("measures the share against the gross movement, so opposed causes cannot exceed 100%", () => {
    // Net is 0 here. Against the net every share is infinite; against the
    // gross they are the halves they actually are.
    const found = protoFinding(ok([
      row({ kind: "spend", amountBase: -500 }),
      row({ kind: "rate", amountBase: 500 }),
    ]));
    expect(found?.lead).toContain("50%");
  });

  it("has nothing to say about a measured zero, or about a window with no history", () => {
    expect(protoFinding(ok([row({ kind: "spend", amountBase: 0 })]))).toBeNull();
    expect(protoFinding({ status: "insufficient", emptyReason: "Not enough history" })).toBeNull();
  });
});
