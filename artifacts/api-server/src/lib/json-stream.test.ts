// The backup export is written as a stream (finding 967c41d36856): one JSON
// body built in memory was 3.59 MB for the seed user, and the heaviest dev
// user held 23,103 request-metric rows (2.5 MB on disk) inside the 30-day
// retention window — bounded by request rate, not by time. These lock the
// two pieces that bound it: rows arrive in pages, and the writer emits the
// same JSON a JSON.stringify of the whole object would.

import { describe, it, expect } from "vitest";
import { pagedRows, writeJsonObject } from "./json-stream";

describe("pagedRows", () => {
  it("asks for one page at a time, after the last key seen, until a short page", async () => {
    const all = Array.from({ length: 7 }, (_, i) => ({ id: i + 1 }));
    const asked: Array<{ after: number | null; limit: number }> = [];
    const pages: unknown[][] = [];
    for await (const page of pagedRows(3, async (after, limit) => {
      asked.push({ after, limit });
      return all.filter((r) => after == null || r.id > after).slice(0, limit);
    }, (r) => r.id)) {
      pages.push(page);
    }
    expect(pages.map((p) => p.length)).toEqual([3, 3, 1]);
    expect(asked).toEqual([
      { after: null, limit: 3 },
      { after: 3, limit: 3 },
      { after: 6, limit: 3 },
    ]);
  });
});

describe("writeJsonObject", () => {
  it("writes what JSON.stringify would, in pieces", async () => {
    const chunks: string[] = [];
    const big = Array.from({ length: 5 }, (_, i) => ({ id: i, at: new Date(Date.UTC(2026, 8, i + 1)), note: `"q" ${i}` }));
    async function* pagesOf<T>(rows: T[], n: number) {
      for (let i = 0; i < rows.length; i += n) yield rows.slice(i, i + n);
    }
    await writeJsonObject(
      [
        ["exportedAt", { value: "2026-10-01T00:00:00.000Z" }],
        ["profile", { value: { id: "u1" } }],
        ["empty", { pages: pagesOf([], 2) }],
        ["requestRecords", { pages: pagesOf(big, 2) }],
        ["settings", { value: null }],
      ],
      async (s) => { chunks.push(s); },
    );
    const text = chunks.join("");
    expect(text).toBe(JSON.stringify({
      exportedAt: "2026-10-01T00:00:00.000Z",
      profile: { id: "u1" },
      empty: [],
      requestRecords: big,
      settings: null,
    }));
    // The rows went out as more than one write — nothing buffered the array.
    expect(chunks.filter((c) => c.includes('\\"q\\"')).length).toBeGreaterThan(1);
  });
});
