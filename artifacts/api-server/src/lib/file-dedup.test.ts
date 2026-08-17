// Dedup rule tests. The important property is determinism — same
// input, same externalId, across process restarts and across
// re-imports of the same statement. Also that plausible-but-
// different inputs never collide.

import { describe, it, expect } from "vitest";
import { computeExternalId } from "./file-dedup";

describe("computeExternalId — determinism", () => {
  it("same input → same externalId across two invocations", () => {
    const input = {
      userId: "user-A",
      accountId: 42,
      date: "2026-08-17",
      description: "STARBUCKS #1234",
      nativeAmount: -4.75,
    };
    expect(computeExternalId(input)).toEqual(computeExternalId(input));
  });

  it("trailing/leading whitespace does not affect the hash", () => {
    const a = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "STARBUCKS #1234", nativeAmount: -4.75,
    });
    const b = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "  STARBUCKS #1234  ", nativeAmount: -4.75,
    });
    expect(a).toBe(b);
  });

  it("internal whitespace differences (double space) collapse", () => {
    const a = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "STARBUCKS  #1234", nativeAmount: -4.75,
    });
    const b = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "STARBUCKS #1234", nativeAmount: -4.75,
    });
    expect(a).toBe(b);
  });

  it("amount precision beyond 2dp is truncated by the format", () => {
    // -4.7500 and -4.75 hash the same — both normalise to "-4.75".
    const a = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "STARBUCKS", nativeAmount: -4.75,
    });
    const b = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "STARBUCKS", nativeAmount: -4.7501,
    });
    // 2dp rounding: -4.7501 → -4.75. Same hash.
    expect(a).toBe(b);
  });
});

describe("computeExternalId — sensitivity", () => {
  const base = {
    userId: "user-A", accountId: 1, date: "2026-08-17",
    description: "STARBUCKS", nativeAmount: -4.75,
  };
  it("different user → different hash", () => {
    expect(computeExternalId({ ...base, userId: "user-B" })).not.toEqual(computeExternalId(base));
  });
  it("different account → different hash", () => {
    expect(computeExternalId({ ...base, accountId: 2 })).not.toEqual(computeExternalId(base));
  });
  it("different date → different hash", () => {
    expect(computeExternalId({ ...base, date: "2026-08-18" })).not.toEqual(computeExternalId(base));
  });
  it("different description → different hash", () => {
    expect(computeExternalId({ ...base, description: "TESCO" })).not.toEqual(computeExternalId(base));
  });
  it("different amount → different hash", () => {
    expect(computeExternalId({ ...base, nativeAmount: -4.76 })).not.toEqual(computeExternalId(base));
  });
  it("sign flip (income vs expense of the same magnitude) → different hash", () => {
    expect(computeExternalId({ ...base, nativeAmount: 4.75 })).not.toEqual(computeExternalId(base));
  });
});

describe("computeExternalId — known collapse (documented)", () => {
  it("two identical purchases on the same day produce ONE externalId", () => {
    // This is the accepted false-positive. Two coffees at the same
    // shop for the same amount on the same day collapse to one row
    // on import. The alternative (ordinal-based hash) breaks
    // re-import dedup whenever a reissued statement adds a row on
    // the same day.
    const row = {
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "STARBUCKS", nativeAmount: -4.75,
    };
    expect(computeExternalId(row)).toBe(computeExternalId(row));
  });
});

describe("computeExternalId — output shape", () => {
  it("returns a 32-char base64url string", () => {
    const id = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "STARBUCKS", nativeAmount: -4.75,
    });
    expect(id).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
