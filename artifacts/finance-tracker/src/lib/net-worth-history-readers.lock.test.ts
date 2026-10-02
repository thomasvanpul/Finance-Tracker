// Lock: these screens draw net worth over time from GET /net-worth/history,
// not from the ft-nw-history localStorage key.
//
// The key holds each day's figure under whatever net-worth definition the app
// had when that screen was opened, written by three screens in two shapes, and
// lives on one device. The server snapshot is one figure, captured on every
// dashboard read, the same on every device.
//
// pages/net-worth-history.tsx is the exception below: it still keeps the
// manual entries the user types in ft-nw-history, which the server does not
// store, and merges them over the server history (lib/net-worth-ledger.ts).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = [
  "components/widgets/net-worth.tsx",
  "pages/accounts.tsx",
];

describe("net-worth history readers use the server history", () => {
  for (const file of FILES) {
    const src = readFileSync(join(SRC_DIR, file), "utf8");

    it(`${file} reads useGetNetWorthHistory`, () => {
      expect(src).toMatch(/useGetNetWorthHistory\(/);
    });

    it(`${file} does not touch ft-nw-history`, () => {
      const hits = src.split("\n").flatMap((line, i) =>
        /ft-nw-history/.test(line) ? [`${file}:${i + 1}`] : [],
      );
      expect(hits).toEqual([]);
    });

    it(`${file} labels a move "today"/"yesterday" only through todayDelta`, () => {
      // The last two entries are a day apart only on a user who opened the
      // app on both days.
      expect(src).not.toMatch(/\.length\s*-\s*2\]\.netWorth/);
    });
  }
});

describe("/net-worth merges manual entries over the server history", () => {
  const file = "pages/net-worth-history.tsx";
  const src = readFileSync(join(SRC_DIR, file), "utf8");

  it(`${file} reads useGetNetWorthHistory`, () => {
    expect(src).toMatch(/useGetNetWorthHistory\(/);
  });

  it(`${file} draws through ledgerFromHistory`, () => {
    expect(src).toMatch(/ledgerFromHistory\(/);
  });

  it(`${file} no longer writes its own auto snapshot`, () => {
    // The server captures the day on the dashboard read, under one definition.
    expect(src).not.toMatch(/note:\s*"auto"/);
  });
});
