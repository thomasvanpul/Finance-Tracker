// The bills-this-week insight fits the slot's one-line body (DESIGN.md §15:
// ~45 characters at 390px). The old body carried 43 fixed characters before
// the figure, so any total of £10 or more was cut mid-word on the phone.

import { describe, it, expect, vi, afterEach } from "vitest";
import { selectInsight } from "./spending-insights";
import type { UpcomingItem } from "@workspace/api-client-react";

const BODY_LIMIT = 45;

const bill = (id: number, dueDate: string, baseEquivalent: number | null) =>
  ({ id, type: "expense", status: "pending", dueDate, baseEquivalent }) as unknown as UpcomingItem;

afterEach(() => vi.useRealTimers());

describe("heavy-week-ahead body", () => {
  it("states the total and the end of the window within the body limit, at a 7-figure total", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T09:00:00Z"));
    const insight = selectInsight([], {
      baseCurrency: "GBP",
      upcomingItems: [bill(1, "2026-09-17", 400_000), bill(2, "2026-09-18", 400_000), bill(3, "2026-09-20", 434_567)],
    }, new Set());
    expect(insight?.source).toBe("heavy-week-ahead");
    expect(insight?.body).toMatch(/^£1,234,567 going out by Wed 23 Sept?$/);
    expect(insight!.body.length).toBeLessThanOrEqual(BODY_LIMIT);
  });

  it("falls back to a count when a bill has no base figure, within the same limit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T09:00:00Z"));
    const insight = selectInsight([], {
      baseCurrency: "GBP",
      upcomingItems: [bill(1, "2026-09-17", 10), bill(2, "2026-09-18", null), bill(3, "2026-09-20", 10)],
    }, new Set());
    expect(insight?.body).toMatch(/^3 expenses due by Wed 23 Sept?$/);
    expect(insight!.body.length).toBeLessThanOrEqual(BODY_LIMIT);
  });
});
