// Lock: every route that spends AI provider budget sits under aiLimiter.
//
// /api/receipt/parse — a vision model on a photograph — was outside it
// until 2026-09-13, because the limiter was gated on the /ai/ prefix and
// the receipt router is mounted at /receipt. This asserts the property
// over the routers themselves, so a new route added to either is covered
// or fails here.
import { describe, it, expect, vi } from "vitest";
import type { Router } from "express";

vi.mock("@workspace/db", () => ({
  db: {},
  userTable: {},
  sessionTable: {},
  accountTable: {},
  verificationTable: {},
  twoFactorTable: {},
  passkeyTable: {},
}));

const { isAiMeteredPath } = await import("./app");
const receiptRouter = (await import("./routes/receipt")).default;
const aiRouter = (await import("./routes/ai")).default;

function routePaths(router: Router): string[] {
  const stack = (router as unknown as { stack: Array<{ route?: { path: string } }> }).stack;
  return stack.flatMap((layer) => (layer.route ? [layer.route.path] : []));
}

describe("aiLimiter · which paths are metered", () => {
  it("meters /api/receipt/parse", () => {
    expect(isAiMeteredPath("/receipt/parse")).toBe(true);
  });

  it("still meters the /ai/ routes", () => {
    expect(isAiMeteredPath("/ai/chat")).toBe(true);
    expect(isAiMeteredPath("/ai/receipt-split")).toBe(true);
  });

  it("matches whole path segments, not string prefixes", () => {
    expect(isAiMeteredPath("/receipts")).toBe(false);
    expect(isAiMeteredPath("/aim/thing")).toBe(false);
    expect(isAiMeteredPath("/transactions")).toBe(false);
  });

  it("every route on the receipt router (mounted at /receipt) is metered", () => {
    const paths = routePaths(receiptRouter).map((p) => `/receipt${p}`);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => !isAiMeteredPath(p))).toEqual([]);
  });

  it("every route on the AI router (mounted with no prefix) is metered", () => {
    const paths = routePaths(aiRouter);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => !isAiMeteredPath(p))).toEqual([]);
  });
});
