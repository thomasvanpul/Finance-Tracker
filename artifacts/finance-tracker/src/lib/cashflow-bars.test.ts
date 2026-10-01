// HOME's cashflow chart drew every bar up from one baseline at
// |balance| / max, so a day at -£500 stood exactly as tall as a day at
// +£500 (finding 59299f513df5). The sign is the one fact about a balance the
// chart must not lose. The geometry now places £0 inside the plot when any
// day is below it, and a negative day hangs down from that line.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cashflowBars } from "./cashflow-bars";
import type { DailyBalance } from "./lowest-so-far";

const day = (d: number, balance: number): DailyBalance => ({ day: d, balance, future: false });

describe("cashflowBars", () => {
  it("puts a negative day below the zero line, not above it", () => {
    const g = cashflowBars([day(1, 500), day(2, -500)]);
    expect(g.top).toBe(500);
    expect(g.bottom).toBe(-500);
    expect(g.zeroPct).toBe(50);
    expect(g.bars[0]).toEqual({ below: false, offsetPct: 50, heightPct: 50 });
    expect(g.bars[1]).toEqual({ below: true, offsetPct: 50, heightPct: 50 });
  });

  it("is the old all-positive chart when nothing goes below zero", () => {
    const g = cashflowBars([day(1, 200), day(2, 100)]);
    expect(g.top).toBe(200);
    expect(g.bottom).toBe(0);
    expect(g.zeroPct).toBe(100);
    expect(g.bars[1]).toEqual({ below: false, offsetPct: 0, heightPct: 50 });
  });

  it("hangs every bar from the top line when the whole month is overdrawn", () => {
    const g = cashflowBars([day(1, -100), day(2, -400)]);
    expect(g.top).toBe(0);
    expect(g.zeroPct).toBe(0);
    expect(g.bars[0]).toEqual({ below: true, offsetPct: 0, heightPct: 25 });
    expect(g.bars[1]).toEqual({ below: true, offsetPct: 0, heightPct: 100 });
  });

  it("keeps a one-percent sliver for a day at exactly zero", () => {
    const g = cashflowBars([day(1, 0), day(2, 300)]);
    expect(g.bars[0]).toEqual({ below: false, offsetPct: 0, heightPct: 1 });
  });

  it("does not divide by zero on an empty or all-zero month", () => {
    expect(cashflowBars([]).bars).toEqual([]);
    expect(cashflowBars([day(1, 0)]).bars[0].heightPct).toBe(1);
  });
});

describe("MobileHome cashflow chart", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "../components/mobile/MobileHome.tsx"), "utf8");

  it("takes its bar geometry from cashflowBars", () => {
    expect(src).toMatch(/cashflowBars\(days\)/);
  });

  it("no longer sizes a bar by the absolute balance", () => {
    expect(src.match(/Math\.abs\(d\.balance\)/g) ?? []).toEqual([]);
  });
});
