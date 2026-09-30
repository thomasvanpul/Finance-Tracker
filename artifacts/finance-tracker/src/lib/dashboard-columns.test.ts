import { describe, expect, it } from "vitest";
import { balanceColumns, sameSet } from "./dashboard-columns";

describe("balanceColumns", () => {
  it("finds the split with the smallest difference", () => {
    const heights = new Map([["a", 100], ["b", 400], ["c", 100], ["d", 100], ["e", 100]]);
    // 400 against the four 100s is exact; b is the only widget right.
    expect([...balanceColumns(["a", "b", "c", "d", "e"], heights)]).toEqual(["b"]);
  });

  it("keeps the first widget on the left", () => {
    const right = balanceColumns(["a", "b"], new Map([["a", 500], ["b", 100]]));
    expect(right.has("a")).toBe(false);
  });

  it("falls back to shorter-column-first past the exact limit", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `w${i}`);
    const right = balanceColumns(ids, new Map(ids.map((id) => [id, 100])));
    expect(right.size).toBe(10);
  });

  it("reproduces the 30 Sep tester layout and fixes it", () => {
    // Net worth 500, accounts 380, recent transactions 460, spending 350,
    // financial health 430 (px, read off the tester-walk capture). Index
    // parity put net worth, transactions and health left: 1,390 against 730.
    const ids = ["nw", "acc", "tx", "spend", "health"] as const;
    const heights = new Map<(typeof ids)[number], number>([
      ["nw", 500], ["acc", 380], ["tx", 460], ["spend", 350], ["health", 430],
    ]);
    const right = balanceColumns(ids, heights, 6);
    const sum = (pick: (id: string) => boolean) =>
      ids.filter(pick).reduce((s, id) => s + heights.get(id)!, 0);
    const diff = Math.abs(sum((id) => right.has(id as never)) - sum((id) => !right.has(id as never)));
    // With net worth pinned left the best split is 960 against 1,160.
    expect(diff).toBe(200);
    expect(diff).toBeLessThan(1390 - 730);
  });

  it("is a fixed point: the same heights give the same split", () => {
    const heights = new Map([["a", 320], ["b", 90], ["c", 210], ["d", 400]]);
    const once = balanceColumns(["a", "b", "c", "d"], heights);
    expect(sameSet(once, balanceColumns(["a", "b", "c", "d"], heights))).toBe(true);
  });

  it("places an unmeasured widget in one column or the other, never neither", () => {
    const right = balanceColumns(["a", "b"], new Map([["a", 100]]));
    expect([...right].every((id) => id === "a" || id === "b")).toBe(true);
    expect(right.has("a")).toBe(false);
  });
});
