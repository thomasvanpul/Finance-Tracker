// ai-switch-honest.lock.test.ts — T2 of the 5 Oct 2026 desktop audit.
//
// WHAT THIS GUARDS
//
// With AI off, /ai-coach presented as fully live: "Your AI Financial
// Coach", a CONTEXT LOADED panel, ten clickable questions and a green
// AI ONLINE badge. The first click came back "AI is off for this account"
// underneath that badge (A2/A3). /briefing offered GENERATE REPORT, which
// could not succeed (A10). With AI on, answers stopped mid-sentence at the
// token cap and nothing said so (A4). And the coach's subtitle read
// "Focused on the complete bloomberg experience." (A1).
//
//   PART A  the A1 string itself, built by coachIntro() for every persona.
//           A real value test: this is the string the page renders.
//   PART B  a source lock that /ai-coach, with the switch off, takes a
//           branch that renders no question chips, no context panel and no
//           ONLINE badge; and that every Generate on /briefing sits behind
//           the switch.
//   PART C  a source lock that the coach reads finishReason "length" and
//           renders the cut marker.
//
// WHAT THIS LOCK CANNOT DO — stated rather than left to be discovered
//
//   - PARTS B and C do not prove what RENDERS. The repo has no DOM test
//     stack (no jsdom, no testing-library), so these read source, the same
//     way T1's monthly-money lock does. The captures in .review/shots/t2/
//     are the record of what rendered, AI on and AI off, void and arctic.
//   - They pin the shape of the branch, not its wording. Rewording the off
//     notice will not fail this; rendering a question chip with AI off will.
//   - The server half of A4 is api-server lib/ai-providers/finish-reason.test.ts.
//
// If this fails, fix the page. Do not relax the pattern.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { coachIntro, COACH_INTRO_NO_PERSONA } from "./ai-coach-copy";
import { PERSONAS } from "./persona";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");
const read = (rel: string): string => readFileSync(join(SRC, rel), "utf8");
// Comments describe the old defects by name ("AI ONLINE", ".toLowerCase()")
// and must not count as code.
const code = (rel: string): string =>
  read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const COACH = "pages/ai-coach.tsx";
const BRIEFING = "pages/briefing.tsx";

describe("PART A — the coach's opening line (A1)", () => {
  it("ANL·05 renders its own words, with no trademark", () => {
    const full = PERSONAS.find((p) => p.id === "full");
    expect(coachIntro(full)).toBe(
      "Full Analyst: Every page and every tool, nothing hidden. I have full access to your spending, budgets, investments, and goals.",
    );
  });

  it.each(PERSONAS.map((p) => [p.code, p] as const))("%s: the tagline appears exactly as written, never re-cased", (_code, p) => {
    const line = coachIntro(p);
    expect(line).toContain(p.tagline);
    expect(line).not.toMatch(/bloomberg/i);
    expect(p.tagline).not.toMatch(/bloomberg/i);
  });

  it("no persona falls back to a stated sentence", () => {
    expect(coachIntro(undefined)).toBe(COACH_INTRO_NO_PERSONA);
  });

  it("the page renders coachIntro and lower-cases no tagline", () => {
    const src = code(COACH);
    expect(src).toContain("{coachIntro(primaryPersona)}");
    expect(src).not.toMatch(/tagline\s*\.\s*toLowerCase/);
  });
});

describe("PART B — with the switch off, nothing looks live (A2/A3/A10)", () => {
  const src = code(COACH);
  const offStart = src.indexOf("isEmpty && !aiOn ? (");
  const liveStart = src.indexOf(") : isEmpty ? (");
  const offBranch = src.slice(offStart, liveStart);

  it("the coach reads the account's switch", () => {
    expect(src).toMatch(/const aiOn = useAiEnabled\(\);/);
  });

  it("the empty state with AI off is its own branch, taken before the live one", () => {
    expect(offStart).toBeGreaterThan(-1);
    expect(liveStart).toBeGreaterThan(offStart);
    expect(offBranch).toContain("<AiOffNotice");
  });

  it("that branch renders no question chips, no context panel, no send action", () => {
    for (const live of ["handleSend", "SuggestedPromptButton", "SmartInsightCard", "Common questions", "Persona picks", "Context loaded", "Your AI Financial Coach"]) {
      expect(offBranch, `AI-off branch contains ${live}`).not.toContain(live);
    }
  });

  it("every live prompt surface sits after the off branch, never before it", () => {
    for (const live of ["Context loaded", "Common questions", "Persona picks", "<SmartInsightCard", "<SuggestedPromptButton"]) {
      const at = src.indexOf(live, src.indexOf("return ("));
      expect(at, `${live} not found in the page`).toBeGreaterThan(liveStart);
    }
  });

  it("the badge says AI OFF before it can say AI ONLINE, and ONLINE appears nowhere else", () => {
    expect(src).toContain('{!aiOn ? "AI OFF" : aiAvailable ? "AI ONLINE" : "AI OFFLINE"}');
    expect(src.split('"AI ONLINE"').length - 1).toBe(1);
    expect(src).toMatch(/background: aiOn && aiAvailable \? "var\(--ft-green\)"/);
  });

  it("sending is refused, and the composer disabled, while the switch is off", () => {
    expect(src).toMatch(/if \(!msg \|\| !aiOn\) return;/);
    expect(src).toMatch(/disabled=\{!aiOn \|\| aiAvailable === false\}/);
    expect(src).toMatch(/disabled=\{!aiOn \|\| !input\.trim\(\)/);
  });

  it("/briefing reads the switch, and every Generate sits behind it", () => {
    const b = code(BRIEFING);
    expect(b).toMatch(/const aiOn = useAiEnabled\(\);/);
    expect(b).toMatch(/const generate = useCallback\(async \(\) => \{\s*if \(!aiOn\) return;/);
    // Three Generate buttons: header, empty-state CTA, report footer. Each
    // is reached only through its own guard.
    expect([...b.matchAll(/onClick=\{generate\}/g)]).toHaveLength(3);
    expect([...b.matchAll(/\{aiOn && \(\s*<button\s+type="button"\s+onClick=\{generate\}/g)]).toHaveLength(2);
    expect(b).toMatch(/\{!aiOn \? \(\s*<AiOffNotice[\s\S]{0,400}?\) : \(\s*<div[\s\S]{0,2500}?onClick=\{generate\}/);
    expect(b).toContain("<AiOffNotice");
  });
});

describe("PART C — an answer cut by the token cap says so (A4)", () => {
  const src = code(COACH);

  it("the coach marks a done answer whose finishReason is 'length'", () => {
    expect(src).toMatch(/m\.truncated = event\.finishReason === "length"/);
  });

  it("and renders the cut marker on it", () => {
    expect(src).toMatch(/msg\.status === "done" && msg\.truncated && \(\s*<StreamingTruncated/);
  });

  it("the client's done event carries finishReason", () => {
    expect(code("lib/ai-chat-client.ts")).toMatch(/type: "done";[^\n]*finishReason\?: string \| null/);
  });
});
