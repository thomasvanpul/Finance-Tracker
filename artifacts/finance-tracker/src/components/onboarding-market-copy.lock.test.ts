// Source-level lock (BACKLOG L3): the first screens a tester meets offer
// nothing this deployment cannot serve. Market data is off by default
// (ENABLE_MARKET_DATA, api-server/src/lib/market-flag.ts), so onboarding's
// tracks, the market persona's copy and its quick-start steps describe
// holdings and cost — never prices, quotes, an index or a price source.
// Until 2 Oct 2026 the first onboarding track read "Investments and market
// prices / Live prices, portfolio P&L, earnings calendar".

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FILES = [
  join(here, "onboarding.tsx"),
  join(here, "persona-quick-start.tsx"),
  join(here, "..", "lib", "persona.ts"),
];

const PROMISES = [
  /live (market )?(data|prices?|P&L)/i,
  /market prices/i,
  /earnings calendar/i,
  /market news/i,
  /price alerts?/i,
  /intraday/i,
  /S&P|Yahoo|NASDAQ|Dow Jones/i,
];

describe("first-run copy promises no market data", () => {
  for (const file of FILES) {
    const source = readFileSync(file, "utf8");
    it(`${file.slice(here.length - "components".length)} names no price feature`, () => {
      const hits = PROMISES.flatMap((re) => source.match(new RegExp(re.source, "gi")) ?? []);
      expect(hits).toEqual([]);
    });
  }
});
