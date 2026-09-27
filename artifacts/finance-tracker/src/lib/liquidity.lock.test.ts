// Liquidity / net-worth label lock.
//
// Two defects from the 2026-09-27 screen audit (P0 4 and 5):
//   - the briefing's "Liquid Assets" and the dashboard's "CASH" KPI summed
//     every account, so a flat, a SIPP and an ISA were shown as cash;
//   - /accounts re-derived net worth as accounts + portfolio and left out
//     the IOUs, printing a second net worth £98.04 from the API's.
//
// What this locks, by reading the source (the screens need a live API):
//   - the dashboard's CASH cell is fed by cashAccountsTotal, not totalCash;
//   - the briefing prints no "Liquid" label and sums with cashAccountsTotal;
//   - /accounts' Net Worth cell takes the API's dashData.netWorth.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("liquidity lock", () => {
  it("dashboard CASH KPI sums cash-type accounts, not totalCash", () => {
    const src = read("pages/dashboard.tsx");
    expect(src).not.toMatch(/const cash = dashData\.totalCash/);
    expect(src).toMatch(/const cashTotal = cashAccountsTotal\(dashData\.accountBreakdown/);
    // No surface in this file re-sums every account as "liquid" or cash.
    expect(src).not.toMatch(/netAccountsTotal\(/);
  });

  it('briefing prints no "Liquid" label and sums only cash accounts', () => {
    const src = read("pages/briefing.tsx");
    expect(src).not.toMatch(/label:\s*"Liquid/);
    expect(src).toMatch(/cashAccountsTotal\(/);
    expect(src).not.toMatch(/netAccountsTotal\(/);
  });

  it("/accounts shows the API's net worth, not a local re-derivation", () => {
    const src = read("pages/accounts.tsx");
    expect(src).toMatch(/const netWorth: number \| null = dashData\?\.netWorth \?\? null;/);
    expect(src).not.toMatch(/const netWorth = totalCash \+ portfolioVal/);
  });
});
