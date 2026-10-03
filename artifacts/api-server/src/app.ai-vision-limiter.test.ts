// Lock: the three chainVision routes get the smaller visionLimiter;
// everything else under /ai or /receipt stays on aiLimiter.
//
// isVisionMeteredPath is an exact-path allowlist, not a prefix, because
// /ai/chat and /ai/batch-categorize sit on the same /ai mount as the vision
// routes but call chainChat / chainCategorize, not chainVision — a prefix
// match would put a one-line chat message on the vision budget too.
import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  userTable: {},
  sessionTable: {},
  accountTable: {},
  verificationTable: {},
  twoFactorTable: {},
  passkeyTable: {},
}));

const { isVisionMeteredPath, isAiMeteredPath } = await import("./app");

describe("isVisionMeteredPath · which AI-metered paths get the smaller vision budget", () => {
  it("meters the three chainVision routes", () => {
    expect(isVisionMeteredPath("/receipt/parse")).toBe(true);
    expect(isVisionMeteredPath("/ai/receipt-scan")).toBe(true);
    expect(isVisionMeteredPath("/ai/receipt-split")).toBe(true);
  });

  it("does NOT meter the non-vision /ai routes", () => {
    expect(isVisionMeteredPath("/ai/chat")).toBe(false);
    expect(isVisionMeteredPath("/ai/batch-categorize")).toBe(false);
  });

  it("every vision-metered path is also AI-metered (subset, never a standalone path)", () => {
    for (const p of ["/receipt/parse", "/ai/receipt-scan", "/ai/receipt-split"]) {
      expect(isAiMeteredPath(p)).toBe(true);
    }
  });
});
