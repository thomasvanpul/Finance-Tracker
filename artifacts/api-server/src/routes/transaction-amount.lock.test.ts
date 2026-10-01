// nativeAmount is a magnitude, never a signed delta — balance.ts derives
// the sign from type (expense/transfer-out negate) and transferDirection.
// A negative value double-negates: a negative expense raised the balance
// it should have lowered (2026-09-30T2018-split-negated-amounts.report.md).
//
// Until this fix, CreateTransactionBody/UpdateTransactionBody declared
// nativeAmount as a bare zod.number(), so any client writer could repeat
// that bug. These lock the schema-level rejection in so the next codegen
// run can't silently drop the constraint again.

import { describe, it, expect } from "vitest";
import { CreateTransactionBody, UpdateTransactionBody } from "@workspace/api-zod";

const validBase = {
  date: "2026-10-01",
  description: "test",
  type: "expense" as const,
  category: "general",
  accountId: 1,
  currency: "GBP",
};

describe("CreateTransactionBody nativeAmount", () => {
  it("rejects a negative nativeAmount", () => {
    const result = CreateTransactionBody.safeParse({ ...validBase, nativeAmount: -50 });
    expect(result.success).toBe(false);
  });

  it("rejects a zero nativeAmount", () => {
    const result = CreateTransactionBody.safeParse({ ...validBase, nativeAmount: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts a positive nativeAmount", () => {
    const result = CreateTransactionBody.safeParse({ ...validBase, nativeAmount: 50 });
    expect(result.success).toBe(true);
  });

  it("rejects a negative toNativeAmount on a transfer leg", () => {
    const result = CreateTransactionBody.safeParse({
      ...validBase,
      type: "transfer",
      nativeAmount: 50,
      toAccountId: 2,
      toNativeAmount: -50,
    });
    expect(result.success).toBe(false);
  });
});

describe("UpdateTransactionBody nativeAmount", () => {
  it("rejects a negative nativeAmount", () => {
    const result = UpdateTransactionBody.safeParse({ nativeAmount: -50 });
    expect(result.success).toBe(false);
  });

  it("rejects a zero nativeAmount", () => {
    const result = UpdateTransactionBody.safeParse({ nativeAmount: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts a positive nativeAmount", () => {
    const result = UpdateTransactionBody.safeParse({ nativeAmount: 50 });
    expect(result.success).toBe(true);
  });

  it("still allows an update that omits nativeAmount entirely", () => {
    const result = UpdateTransactionBody.safeParse({ category: "new-category" });
    expect(result.success).toBe(true);
  });
});
