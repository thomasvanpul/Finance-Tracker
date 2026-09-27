import { describe, it, expect } from "vitest";
import { shortDay, spendDelta } from "./spend-delta";

describe("spendDelta", () => {
  it("carries the direction in the word and keeps the amount unsigned", () => {
    expect(spendDelta(40.45, 1313.21, "2026-08-27")).toEqual({ kind: "less", abs: 1272.76, day: "27 Aug" });
    expect(spendDelta(120, 100, "2026-08-27")).toEqual({ kind: "more", abs: 20, day: "27 Aug" });
  });
  it("reads as the same when the two agree to the penny", () => {
    expect(spendDelta(10.001, 10.004, "2026-08-27")).toEqual({ kind: "same", day: "27 Aug" });
  });
});

describe("shortDay", () => {
  it("formats a calendar date without a timezone shift", () => {
    expect(shortDay("2026-03-01")).toBe("1 Mar");
  });
});
