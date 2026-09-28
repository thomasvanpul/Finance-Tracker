// Lock · pages/dashboard.tsx is desktop-only, so it does not branch on width
// ────────────────────────────────────────────────────────────────────────────
//
// App.tsx's Router returns <PhoneShell /> whenever useIsMobile() is true, and
// PhoneShell owns every route below 768px (BACKLOG § D5). The Dashboard page
// is mounted only in the desktop <Switch>, so a phone never reaches it and
// every `isMobile` branch inside it was dead: a compact-tile grid, a phone
// widget picker, a phone overview and phone type sizes, none of which a phone
// user could see. Dead branches are not neutral here — they are what a reader
// takes for the phone home screen, and they carried their own copies of rules
// (tap targets, compact tiles) that the live phone screens then contradicted.
// Finding 3918fbcba701; removed 2026-09-28.
//
// Rule: pages/dashboard.tsx does not read the viewport width — no
// useIsMobile, no `isMobile`, no `innerWidth` comparison. A phone variant of
// something on this page belongs in components/phone/, where PhoneShell can
// reach it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// Comments are stripped first so this rule's own history can be written down
// in the file without tripping it.
function code(path: string): string {
  return readFileSync(join(SRC_DIR, path), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const WIDTH_BRANCH = /\buseIsMobile\b|\bisMobile\b|\binnerWidth\b/g;

describe("dashboard is desktop-only", () => {
  it("App.tsx still hands every phone width to PhoneShell before the desktop Switch", () => {
    // The premise of the rule below. If this ever changes, the dashboard may
    // need a phone branch again and this lock should be revisited, not kept.
    expect(code("App.tsx")).toMatch(/if \(isMobile\) return <PhoneShell \/>;/);
  });

  it("pages/dashboard.tsx has no viewport-width branch", () => {
    const hits = [...code("pages/dashboard.tsx").matchAll(WIDTH_BRANCH)].map((m) => m[0]);
    expect(hits, `found ${hits.length}: ${[...new Set(hits)].join(", ")}`).toEqual([]);
  });
});
