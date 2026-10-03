// The desktop status footer said CONNECTED as a string literal, so it said
// it in airplane mode too (verify-offline budget-offline.png, 3 Oct 2026).
// Desktop has no offline banner — the mobile one is isMobile-gated — so the
// footer is the only place a desktop user can read that the figures on
// screen are the cached copy. It reads useNetworkStatus, like the banner.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "components", "layout.tsx"),
  "utf8",
);
const footer = src.slice(src.indexOf("{/* Status strip */}"), src.indexOf("</footer>"));

describe("desktop status footer", () => {
  it("is found", () => {
    expect(footer.length).toBeGreaterThan(0);
  });

  it("never states CONNECTED as a fixed literal", () => {
    expect(footer).not.toMatch(/>\s*CONNECTED\s*</);
  });

  it("derives its connection word from isOnline", () => {
    expect(footer).toMatch(/isOnline\s*\?\s*"CONNECTED"\s*:\s*"OFFLINE"/);
  });
});
