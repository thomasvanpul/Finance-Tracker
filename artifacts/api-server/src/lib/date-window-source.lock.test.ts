// date-window-source.lock.test.ts
//
// WHAT THIS GUARDS
//
// On 2026-09-11 three implementations of "the next 30 days" were running at
// once in this server:
//
//   dashboard.ts:398-402   localDateString + setDate(+30)   local, calendar
//   upcoming.ts:71-72      toISOString().slice(0, 10)       UTC
//   ai-context.ts:154-162  now.getTime() + 30 * 86_400_000  milliseconds
//
// At the instant they were measured, server-local was 2026-09-11 and UTC was
// 2026-09-10, so /upcoming/summary was querying [2026-09-10, 2026-10-10]
// while /dashboard queried [2026-09-11, 2026-10-11]. Two different windows,
// same user, same instant, both in production code. They agreed on the total
// only because no pending row fell on a boundary date in the seed data —
// masked, not absent.
//
// date-ranges.ts:1-11 records that this exact UTC/local mix was found and
// fixed once before, in the month-key path. upcoming.ts never got that fix,
// and eight further sites had the same defect. It is being fixed a second
// time here; this lock is what stops a third.
//
// THE TWO RULES
//
//   A. No `.toISOString().slice(0, 10)` or `.slice(0, 7)` under src/routes
//      or src/lib. toISOString() is UTC. A calendar date shown to, or
//      queried on behalf of, a user is the date on THEIR wall clock, and at
//      UTC+8 the two differ for eight hours out of every twenty-four.
//      Use localDateString / localMonthString / forwardWindow /
//      trailingWindow from lib/date-ranges instead.
//
//   B. A day-in-milliseconds literal may be DIVIDED but never ADDED into a
//      Date. Dividing two instants by 86_400_000 counts elapsed days and is
//      fine — Math.round absorbs the DST hour. Adding `n * 86_400_000` to a
//      Date claims every day is 86,400 seconds, which is false twice a year:
//      date-ranges.window.test.ts proves a 30-day window built that way
//      lands on 2026-04-15 where the calendar says 2026-04-14.
//      Use forwardWindow / trailingWindow, or Date.UTC-anchored string
//      arithmetic if the value is a date string with no timezone.
//
// Comments are stripped before scanning, so prose may quote the banned
// forms — this file and date-ranges.ts both do.
//
// If this fails, fix the call site. Do NOT add an allowlist entry to make it
// pass: every entry below was reviewed one at a time and carries the reason
// it is there, and the two counts asserted at the bottom mean a silent
// addition fails as loudly as the pattern it was hiding.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNED_DIRS = ["routes", "lib"];

type Status = "correct" | "deferred-bug";
interface Allowed { file: string; rule: "A" | "B"; status: Status; why: string }

const ALLOWLIST: readonly Allowed[] = [
  {
    file: "lib/allocation.ts", rule: "A", status: "correct",
    why: "addDays round-trips a date STRING entirely in UTC — Date.UTC in, setUTCDate, toISOString out. No local clock is ever involved, so there is no local/UTC gap to open.",
  },
  {
    file: "lib/subscription-recurrence.ts", rule: "B", status: "correct",
    why: "addDaysIso anchors on Date.UTC(y, m, d) before adding n * 86_400_000, the same UTC-only frame as allocation.addDays. A date string carries no timezone and must not be routed through a local Date.",
  },
  {
    file: "lib/market.ts", rule: "A", status: "correct",
    why: "Market-data domain: exchange calendars, quote timestamps and earnings dates belong to the exchange, not to the user's wall clock, and localising them would be the bug.",
  },
  {
    file: "lib/market.ts", rule: "B", status: "correct",
    why: "period1 is an advisory lookback bound sent to Yahoo; the response is used exactly as returned, so no user-visible date is derived from it and a boundary off by one costs one price point.",
  },
  {
    file: "lib/market-adapters.ts", rule: "A", status: "correct",
    why: "Frankfurter timeseries start, in the ECB's own publication calendar. Same reasoning as market.ts — a provider range bound, never a date this app shows anyone.",
  },
  {
    file: "lib/market-adapters.ts", rule: "B", status: "correct",
    why: "The same Frankfurter lookback bound. The request is open-ended (start..), so an extra or missing historical rate at the far end changes nothing downstream.",
  },
  {
    file: "routes/enable-banking.ts", rule: "A", status: "correct",
    why: "Consent validUntil, a value in the Enable Banking API's contract rather than in the user's calendar. Set once against a 180-day TTL where a day either way is not material.",
  },
  {
    file: "routes/enable-banking.ts", rule: "B", status: "correct",
    why: "The same consent TTL. A TTL genuinely is n times 86,400 seconds — it is a duration, not a count of calendar days, so millisecond arithmetic is the correct model here.",
  },
  {
    file: "lib/recurring-detector-server.ts", rule: "A", status: "deferred-bug",
    why: "addDays parses a date string as UTC midnight then shifts it with LOCAL setDate/getDate, so west of Greenwich it returns the previous day — and its output IS shown to the user as a predicted next occurrence. Same defect. recurring_patterns was declared out of scope by the task that wrote this lock. FINDING recorded in .review/report.md 2026-09-11.",
  },
];

// ── Scanning ────────────────────────────────────────────────────────────────

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
      out.push(full);
    }
  };
  for (const d of SCANNED_DIRS) walk(join(SRC, d));
  return out.sort();
}

// Strip // line comments and /* */ block comments so the rules apply to code
// and never to prose. Deliberately naive about "//" inside a string literal:
// a false positive there is a comment that gets shortened, which cannot turn
// a violation into a pass.
function stripComments(source: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const raw of source.split("\n")) {
    let line = raw;
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) { out.push(""); continue; }
      line = line.slice(end + 2);
      inBlock = false;
    }
    const blockStart = line.indexOf("/*");
    if (blockStart !== -1) { inBlock = !line.includes("*/", blockStart); line = line.slice(0, blockStart); }
    const lineStart = line.indexOf("//");
    if (lineStart !== -1) line = line.slice(0, lineStart);
    out.push(line);
  }
  return out;
}

// Rule A — a UTC instant read back as a calendar date or month key.
const RULE_A = /\.toISOString\(\)\s*\n?\s*\.slice\(\s*0\s*,\s*(?:10|7)\s*\)/;

// Rule B — a day-in-milliseconds literal used multiplicatively (n * DAY),
// which produces an instant N days away. The same literal under `/` counts
// elapsed days and is allowed.
const DAY_MS = String.raw`(?:86[_,]?400[_,]?000|24\s*\*\s*60\s*\*\s*60\s*\*\s*1000|1000\s*\*\s*60\s*\*\s*60\s*\*\s*24)`;
const RULE_B = new RegExp(String.raw`(?:\*\s*${DAY_MS}|${DAY_MS}\s*\*)`);

interface Violation { file: string; rule: "A" | "B"; line: number; text: string }

// Rule A is matched against the whole comment-stripped file, not line by
// line: market-adapters.ts:546 and enable-banking.ts:74 both break
// `.toISOString()` and `.slice(0, 10)` across lines, and the first version of
// this lock walked past both of them. A scanner that only sees one line at a
// time cannot enforce a rule about an expression.
function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function scan(): Violation[] {
  const found: Violation[] = [];
  for (const path of sourceFiles()) {
    const file = relative(SRC, path);
    const lines = stripComments(readFileSync(path, "utf8"));
    const text = lines.join("\n");

    for (const m of text.matchAll(new RegExp(RULE_A.source, "g"))) {
      const line = lineOf(text, m.index);
      found.push({ file, rule: "A", line, text: (lines[line - 1] ?? "").trim() });
    }
    lines.forEach((line, i) => {
      if (RULE_B.test(line)) found.push({ file, rule: "B", line: i + 1, text: line.trim() });
    });
  }
  return found;
}

const allowed = (v: Violation): boolean =>
  ALLOWLIST.some((a) => a.file === v.file && a.rule === v.rule);

// ── The lock ────────────────────────────────────────────────────────────────

describe("date windows are built from one helper", () => {
  const violations = scan();

  it("scans a non-trivial number of files, so a broken walk cannot pass silently", () => {
    expect(sourceFiles().length).toBeGreaterThan(30);
  });

  it("rule A — no toISOString().slice(0, 10 | 7) outside the allowlist", () => {
    const bad = violations.filter((v) => v.rule === "A" && !allowed(v));
    expect(bad.map((v) => `${v.file}:${v.line}  ${v.text}`)).toEqual([]);
  });

  it("rule B — a day-in-ms literal may be divided, never multiplied into a Date", () => {
    const bad = violations.filter((v) => v.rule === "B" && !allowed(v));
    expect(bad.map((v) => `${v.file}:${v.line}  ${v.text}`)).toEqual([]);
  });

  it("catches the three defects it was written for", () => {
    // Regression guard on the RULES, not the tree: if these stop matching,
    // the lock has been quietly defanged and the two tests above would pass
    // on a tree that had the defect back.
    expect(RULE_A.test('const todayStr = today.toISOString().slice(0, 10);')).toBe(true);
    expect(RULE_A.test('const month = new Date().toISOString().slice(0, 7);')).toBe(true);
    expect(RULE_B.test('const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);')).toBe(true);
    expect(RULE_B.test('const in30 = new Date(now.getTime() + 30 * 86_400_000);')).toBe(true);
    expect(RULE_A.test('new Date(Date.now())\n      .toISOString()\n      .slice(0, 10);')).toBe(true);
    // And does not fire on the legitimate forms.
    expect(RULE_A.test('createdAt: item.createdAt.toISOString(),')).toBe(false);
    expect(RULE_B.test('return Math.round((b - a) / 86_400_000);')).toBe(false);
  });

  it("every allowlist entry still corresponds to a real match", () => {
    // An entry that no longer matches anything is an entry that has outlived
    // its site. Delete it rather than leaving a licence lying around.
    const stale = ALLOWLIST.filter((a) =>
      !violations.some((v) => v.file === a.file && v.rule === a.rule));
    expect(stale.map((a) => `${a.file} rule ${a.rule}`)).toEqual([]);
  });

  it("the allowlist has not grown", () => {
    // Widening the allowlist is how a lock dies. These counts make it a
    // deliberate, reviewable edit. Two of the six are known defects that
    // were out of the fixing task's scope and are recorded as findings; if
    // one is fixed, drop its entry and this number together.
    expect(ALLOWLIST.filter((a) => a.status === "correct")).toHaveLength(8);
    expect(ALLOWLIST.filter((a) => a.status === "deferred-bug")).toHaveLength(1);
    for (const a of ALLOWLIST) expect(a.why.length).toBeGreaterThan(60);
  });
});
