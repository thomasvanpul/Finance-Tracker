import { describe, it, expect, afterEach } from "vitest";
import { normalizeMerchant } from "./merchant-normalizer";
import { detectRecurringPatterns } from "./recurring-detector-server";

// SYNTHETIC FIXTURE — not anyone's real ledger. It reproduces the shape
// the brand-wide key produced: one annual licence, one monthly music
// subscription and one retail purchase, all billed by Apple.
//
// This test pins the mechanism the normaliser fix exists to unblock. It
// does NOT claim anything about what a real ledger contains.
const RAW = [
  // annual developer licence, USD, three years
  { date: "2023-11-02", description: "APPLE.COM/BILL DEVELOPER", nativeAmount: "99.00", currency: "USD", type: "expense" },
  { date: "2024-11-03", description: "APPLE.COM/BILL DEVELOPER", nativeAmount: "99.00", currency: "USD", type: "expense" },
  { date: "2025-11-02", description: "APPLE.COM/BILL DEVELOPER", nativeAmount: "99.00", currency: "USD", type: "expense" },
  // monthly music subscription, GBP
  { date: "2025-09-08", description: "APPLE.COM/BILL", nativeAmount: "10.99", currency: "USD", type: "expense" },
  { date: "2025-10-08", description: "APPLE.COM/BILL", nativeAmount: "10.99", currency: "USD", type: "expense" },
  { date: "2025-11-08", description: "APPLE.COM/BILL", nativeAmount: "10.99", currency: "USD", type: "expense" },
  // one-off retail purchase
  { date: "2025-06-14", description: "APPLE STORE R123", nativeAmount: "179.00", currency: "USD", type: "expense" },
];

function normalised(rows: typeof RAW) {
  return rows.map(r => ({ ...r, description: normalizeMerchant(r.description) }));
}

describe("normaliser → detector, on a synthetic Apple-shaped fixture", () => {
  it("the brand-wide key collapses all three into one rejected group", () => {
    // Simulate the OLD behaviour: everything Apple-ish becomes "Apple".
    const brandWide = RAW.map(r => ({ ...r, description: "Apple" }));
    expect(detectRecurringPatterns(brandWide)).toHaveLength(0);
  });

  it("the channel-aware key keeps the annual licence in its own group", () => {
    const out = detectRecurringPatterns(normalised(RAW));
    const keys = out.map(p => p.normalizedKey);
    expect(keys).toContain("Apple Developer");
    const licence = out.find(p => p.normalizedKey === "Apple Developer")!;
    expect(licence.occurrenceCount).toBe(3);
    expect(licence.expectedAmount).toBe(99);
    // ~365 days, within the detector's ±7d gap tolerance
    expect(Math.abs(licence.intervalDays - 365)).toBeLessThanOrEqual(7);
  });

  it("the retail purchase no longer contaminates the subscription group", () => {
    const out = detectRecurringPatterns(normalised(RAW));
    expect(out.map(p => p.normalizedKey)).not.toContain("Apple Store");
  });
});

// ── The residual defect the normaliser cannot reach ────────────────────────
//
// A normaliser can only separate what the descriptor distinguishes. Many
// banks render every Apple digital charge as a bare `APPLE.COM/BILL` with
// no channel token at all. When that happens the annual licence and the
// monthly subscription share a descriptor AND a currency, so they land in
// one group, and the ±20% amount gate rejects it — exactly as before.
//
// This is not a gap in the rules; it is the limit of the approach. Closing
// it needs the DETECTOR to sub-group a key by amount cluster before
// applying the amount gate. That is proposed in the report, not built here.
const UNTOKENISED = [
  { date: "2023-11-02", description: "APPLE.COM/BILL", nativeAmount: "99.00", currency: "USD", type: "expense" },
  { date: "2024-11-03", description: "APPLE.COM/BILL", nativeAmount: "99.00", currency: "USD", type: "expense" },
  { date: "2025-11-02", description: "APPLE.COM/BILL", nativeAmount: "99.00", currency: "USD", type: "expense" },
  { date: "2025-09-08", description: "APPLE.COM/BILL", nativeAmount: "10.99", currency: "USD", type: "expense" },
  { date: "2025-10-08", description: "APPLE.COM/BILL", nativeAmount: "10.99", currency: "USD", type: "expense" },
  { date: "2025-11-08", description: "APPLE.COM/BILL", nativeAmount: "10.99", currency: "USD", type: "expense" },
];

describe("residual: an untokenised billing descriptor is still lost", () => {
  it("normalises to a single key, because there is nothing to tell apart", () => {
    const keys = new Set(UNTOKENISED.map(r => normalizeMerchant(r.description)));
    expect(keys.size).toBe(1);
  });

  it("and the detector therefore still finds neither charge", () => {
    const out = detectRecurringPatterns(
      UNTOKENISED.map(r => ({ ...r, description: normalizeMerchant(r.description) })),
    );
    expect(out).toHaveLength(0);
  });
});

// ── Characterisation: INTERVAL_TOLERANCE_DAYS is absolute, not relative ────
//
// These tests do not propose a change. They pin the boundary a report
// cites, so the numbers in it cannot quietly go stale.
//
// The detector requires every gap to be within 7 days of the median gap.
// That 7 is an absolute count, so the tolerance it buys depends entirely
// on the cadence: ±7d on a ~30d monthly gap is ±23%, but ±7d on a ~365d
// annual gap is ±1.9%. The constant is twelve times stricter, in relative
// terms, for the cadence whose billing date drifts MOST — annual renewals
// move with weekends, card reissues and billing-system migrations.
//
// So "annual is undetectable" is not true as stated: three annual
// occurrences on a steady date ARE found. What is true is that annual
// detection is the most fragile, for the arbitrary reason that the
// tolerance was tuned for monthly.
function annual(gaps: [number, number]) {
  const start = new Date("2023-10-04T00:00:00Z");
  const dates = [new Date(start)];
  for (const g of gaps) {
    const next = new Date(dates[dates.length - 1]);
    next.setUTCDate(next.getUTCDate() + g);
    dates.push(next);
  }
  return dates.map(d => ({
    date: d.toISOString().slice(0, 10),
    description: "Apple Developer",
    nativeAmount: "99.00",
    currency: "USD",
    type: "expense",
  }));
}

describe("annual detection is possible, but the gap tolerance is unforgiving", () => {
  it("finds a steady annual charge at three occurrences", () => {
    const out = detectRecurringPatterns(annual([365, 365]));
    expect(out).toHaveLength(1);
    expect(out[0].occurrenceCount).toBe(3);
    expect(Math.abs(out[0].intervalDays - 365)).toBeLessThanOrEqual(7);
  });

  it("tolerates a renewal date that slips by a week", () => {
    expect(detectRecurringPatterns(annual([365, 372]))).toHaveLength(1);
  });

  it("loses the same charge when the renewal date slips by two weeks", () => {
    // 381 and 349 straddle a 365 median by 16 days. Nothing about this
    // series is less real than the one above — only less punctual.
    expect(detectRecurringPatterns(annual([381, 349]))).toHaveLength(0);
  });

  it("applies a far looser relative tolerance to the same slip when monthly", () => {
    // A monthly series slipping by the same proportion (~4.4%) survives
    // easily, because 7 absolute days is a wide net at a 30-day gap.
    const monthly = annual([30, 32]).map((r, i) => ({
      ...r,
      date: ["2026-01-05", "2026-02-04", "2026-03-08"][i],
    }));
    expect(detectRecurringPatterns(monthly)).toHaveLength(1);
  });
});

// ── Regression: nextExpected must not shift a day across a DST boundary ───
//
// addDays() parses the date-only string as UTC midnight, then used to walk
// it forward with local setDate/getDate before formatting back through
// toISOString(). That round-trip is a no-op in a timezone with a constant
// offset, but a DST transition between the input date and input+days shifts
// the local wall-clock by an hour without moving the underlying instant by a
// full day, so the UTC day printed back out lands one day early — west of
// Greenwich, where UTC midnight already maps to the previous local day.
// Fixed by keeping the whole walk in UTC (setUTCDate/getUTCDate).
describe("nextExpected survives a DST transition in the server's local timezone", () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTZ;
  });

  it("lands on the correct UTC date when the gap crosses the US spring-forward (2026-03-08)", () => {
    process.env.TZ = "America/New_York";

    const monthly = [
      { date: "2026-01-08", description: "Apple Developer", nativeAmount: "99.00", currency: "USD", type: "expense" },
      { date: "2026-02-08", description: "Apple Developer", nativeAmount: "99.00", currency: "USD", type: "expense" },
      { date: "2026-03-08", description: "Apple Developer", nativeAmount: "99.00", currency: "USD", type: "expense" },
    ];

    const out = detectRecurringPatterns(monthly);
    expect(out).toHaveLength(1);
    // last occurrence 2026-03-08 + a 30-day interval must be 2026-04-07,
    // not the pre-fix 2026-04-06.
    expect(out[0].nextExpected).toBe("2026-04-07");
  });
});
