// A figure summed from a query's rows is only real when the rows arrived.
//
// Offline, the persister refuses to store an empty array (offline-cache.ts
// isBannedCacheValue), so a month with no expenses restores nothing and the
// expense query ends with no data — status=error, or paused. /budget summed
// `expenseTxs ?? []` and showed "TOTAL SPENT £0.00" off that error, rendered
// exactly like a real zero (verify-offline FABRICATED ZEROS, 3 Oct 2026).
//
// These cases fix the rule the screens read: rows present (even none) are
// ready; no rows while a fetch runs is loading; no rows and no fetch running
// is unavailable, and an unavailable figure is not drawn at all.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { derivedFigureState } from "./derived-figure-state";

describe("derivedFigureState", () => {
  it("an empty result the API returned is ready — a real zero", () => {
    expect(derivedFigureState({ data: [], isFetching: false })).toBe("ready");
  });

  it("rows present are ready, even while a background refetch runs", () => {
    expect(derivedFigureState({ data: [{ id: 1 }], isFetching: true })).toBe("ready");
  });

  it("no data while the first fetch runs is loading", () => {
    expect(derivedFigureState({ data: undefined, isFetching: true })).toBe("loading");
  });

  it("no data and no fetch running (errored, or paused offline) is unavailable", () => {
    expect(derivedFigureState({ data: undefined, isFetching: false })).toBe("unavailable");
  });
});

describe("/budget does not sum spend it never received", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "pages", "budget.tsx"),
    "utf8",
  );

  it("reads the expense query's state through derivedFigureState", () => {
    expect(src).toMatch(/derivedFigureState\(\{\s*data:\s*expenseTxsSigned/);
  });

  it("returns before the spend figures render when spend is unavailable", () => {
    expect(src).toMatch(/if \(spendState === "unavailable"\)/);
  });
});
