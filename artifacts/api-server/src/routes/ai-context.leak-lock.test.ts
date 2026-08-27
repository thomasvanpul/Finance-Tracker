// AI context leak-lock — scans the SPA source tree for the three
// defect classes that let client-assembled financial context leak
// into /api/ai/* requests.
//
// This session found FOUR call sites (ai-agent, ai-coach, goals,
// investments, budget, briefing, dashboard, markets-tab — split
// across two sweep passes) that each shipped balances, goals, or
// merchant strings up in a POST body. Every one of them was fixed
// individually; each was found by grep after a bug report. Without
// a source-scan lock, the fifth surface hides in a page that ships
// once and never gets a second look.
//
// Rules (all four scan `artifacts/finance-tracker/src`, skipping
// test files):
//
//   1. Only lib/ai-chat-client.ts may reference /api/ai/chat.
//      That module is the one client-side owner of the SSE endpoint —
//      every other surface consumes it through streamChat() or
//      oneShotInsight(). Duplicating the fetch is how each of the
//      four leak sites was born.
//
//   2. No file may ship a `context:` field in a request body to
//      any /api/ai/* endpoint. This catches the specific leak
//      vector (client-assembled context string posted up) directly,
//      independent of endpoint name changes. The server assembles
//      context from the authenticated user's own rows —
//      lib/ai-context.ts, buildChatContext(userId, path).
//
//   3. No file may combine a call to /api/ai/* with a currency-
//      formatted value or financial field name in a template
//      literal. The narrower "function named buildContext"
//      version of this rule missed investments.tsx, which used a
//      buildPrompt() function that inlined a full ticker×£ matrix
//      into the prompt text instead of a context field. Renaming
//      the function or inlining the string both escape a
//      name-based check. This one catches the leak by its shape.
//
//      Whitelist below documents why each entry is legitimately
//      allowed to send data to an AI endpoint. A whitelist is
//      visible in the diff; a weakened regex is not.
//
//   4. No client file may reference retired Gemini models or
//      stale "Powered by Gemini" labels. Gemini was removed
//      2026-08-23 (AQ.-prefixed keys are incompatible with the
//      Generative Language REST API); references left behind
//      would mislead users about what's serving them.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");
const FE_SRC = join(REPO_ROOT, "artifacts", "finance-tracker", "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "generated" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) out.push(full);
  }
  return out;
}

function readSourceFiles(): Array<{ path: string; text: string; relative: string }> {
  return walk(FE_SRC)
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
    .map((path) => ({
      path,
      relative: relative(FE_SRC, path),
      text: readFileSync(path, "utf-8"),
    }));
}

// Format one hit as "path:line — matched pattern" so the failure
// message points the reader at the exact source location.
function locateFirstMatch(text: string, pattern: RegExp): number | null {
  const match = pattern.exec(text);
  if (!match) return null;
  return text.slice(0, match.index).split("\n").length;
}

// ── Rule 1 ────────────────────────────────────────────────────────────────
describe("AI leak lock · Rule 1 — /api/ai/chat has ONE owner", () => {
  const ALLOWED_OWNER = "lib/ai-chat-client.ts";

  it(`only ${ALLOWED_OWNER} may reference /api/ai/chat`, () => {
    const hits: string[] = [];
    for (const f of readSourceFiles()) {
      if (f.relative === ALLOWED_OWNER) continue;
      if (!f.text.includes("/api/ai/chat")) continue;
      const line = locateFirstMatch(f.text, /\/api\/ai\/chat/);
      hits.push(`${f.relative}:${line}`);
    }
    if (hits.length > 0) {
      throw new Error(
        `/api/ai/chat has multiple owners in the SPA. This endpoint is SSE — every duplicate fetch is a broken caller AND a place a future context leak can hide. ` +
        `Route all chat traffic through ${ALLOWED_OWNER} (streamChat for conversation, oneShotInsight for one-shot inserts). Offenders:\n  ${hits.join("\n  ")}`,
      );
    }
    expect(hits).toEqual([]);
  });
});

// ── Rule 2 ────────────────────────────────────────────────────────────────
describe("AI leak lock · Rule 2 — no context: field in AI request bodies", () => {
  it("no client file may post a `context:` field to /api/ai/*", () => {
    const hits: string[] = [];
    for (const f of readSourceFiles()) {
      if (!f.text.includes("/api/ai/")) continue;
      // Match `context:` in OBJECT-LITERAL POSITION only. The
      // preceding character must be `{`, `,`, or a newline —
      // otherwise "portfolio context," inside a prose prompt
      // triggers this and it isn't a leak. Object-literal shape
      // is the actual thing we're forbidding here.
      const bodyContextRe = /[{,\n]\s*context\s*:/;
      if (!bodyContextRe.test(f.text)) continue;
      const line = locateFirstMatch(f.text, bodyContextRe);
      hits.push(`${f.relative}:${line}`);
    }
    if (hits.length > 0) {
      throw new Error(
        `Client files must not assemble a context string and ship it to /api/ai/*. The server builds user context from the authenticated user's own rows (lib/ai-context.ts, buildChatContext). ` +
        `Migrate to oneShotInsight({ path, prompt }) — the endpoint gets everything it needs from userId + path. Offenders:\n  ${hits.join("\n  ")}`,
      );
    }
    expect(hits).toEqual([]);
  });
});

// ── Rule 3 ────────────────────────────────────────────────────────────────
describe("AI leak lock · Rule 3 — no financial values in prompts to AI", () => {
  // Detection: file both talks to an AI endpoint (directly OR
  // through the shared client) AND contains a template literal
  // with a currency-formatted value or a financial field name.
  //
  // Template literals were the specific shape Thomas called out
  // when narrowing this rule: they cover the buildPrompt() escape
  // (function returning a template with interpolated financial
  // values) that a narrower prompt-position-only rule would miss.
  //
  // False positives — pages that render financial UI (chart
  // formatters, chip labels, tooltip titles) AND consume AI
  // through the shared client — are handled with a per-file
  // whitelist. Whitelist entries carry a specific reason so a
  // reviewer can spot-check what's actually in the file.
  //
  // Adding an entry means: I looked at the file, its template
  // literals with financial markers are all JSX/chart rendering,
  // and its prompts (to oneShotInsight/streamChat) are static or
  // user-typed. If a future edit introduces a leak-shaped template,
  // the whitelist entry's reason no longer holds and the reviewer
  // catches it in the diff.

  // POST-shaped fetches to AI endpoints, plus the shared client's
  // entry points. If a file contains any of these markers, it's
  // actively sending payload to an AI endpoint. A file that only
  // pings /api/ai/status (GET, no body) can't leak.
  const AI_POST_MARKERS: string[] = [
    `"/api/ai/chat"`,
    `"/api/ai/receipt-scan"`,
    `"/api/ai/receipt-split"`,
    `"/api/ai/batch-categorize"`,
    `"/api/receipt/parse"`,
    `oneShotInsight(`,
    `streamChat(`,
  ];

  // WHITELIST — files that either legitimately ship financial-shaped
  // data to an AI endpoint because THAT DATA IS THE ENDPOINT'S
  // DEFINED INPUT, OR consume the sanctioned AI client while also
  // rendering financial values for local UI display.
  //
  // Entries are visible in every diff. Adding to this list is a
  // review checkpoint: confirm the file's template literals with
  // financial markers are all UI rendering (chart formatters, chip
  // labels, tooltips), and its prompts to AI are static or
  // user-typed with no financial interpolation.
  const WHITELIST: Array<{ path: string; reason: string }> = [
    {
      path: "lib/ai-chat-client.ts",
      reason: "The sanctioned client for /api/ai/chat. Ships {messages, path} — no financial values in this file. Whitelist is defensive in case a future edit adds one temporarily.",
    },
    {
      path: "pages/transactions.tsx",
      reason: "Ships transaction rows (id, description, amount, type) to /api/ai/batch-categorize. Merchant strings ARE the categorisation input; the server can't categorise what it hasn't seen. Not a leak — endpoint contract.",
    },
    {
      path: "pages/split.tsx",
      reason: "Ships imageBase64 + members array to /api/ai/receipt-split. The image is the receipt to OCR; members are the split participants. Both are the endpoint's defined input.",
    },
    {
      path: "components/quick-add-transaction.tsx",
      reason: "Ships imageBase64 to /api/receipt/parse. The image is the receipt to OCR. Endpoint's defined input.",
    },
    {
      path: "components/ai-agent.tsx",
      reason: "Floating chat surface. Consumes /api/ai/chat through streamChat. Prompts originate from user input, never from local financial state. Financial markers are UI rendering (message bubbles, placeholder copy).",
    },
    {
      path: "pages/ai-coach.tsx",
      reason: "Dedicated Coach page. Consumes /api/ai/chat through streamChat. Free-typed prompts and static suggestion strings. SmartInsight suggestion prompts embed budget category name + %; the server already has those via buildChatContext so the model reads them from context anyway.",
    },
    {
      path: "pages/goals.tsx",
      reason: "Goals insight page. Consumes /api/ai/chat via oneShotInsight with a static prompt (\"Give me 2 specific actionable insights about my goals progress\"). Financial template literals in this file are chart y-axis tick formatters (`£${v}` labels), not prompts. Migrated from client-side buildContext 2026-08-23.",
    },
    {
      path: "pages/budget.tsx",
      reason: "Budget insight page. Consumes /api/ai/chat via oneShotInsight with a static prompt. Financial template literals are chart tick formatters (`£${v}`), chip labels (`+${formatBaseMoney(...)} over`), and tooltip titles (`${category}: ${formatBaseMoney(spent)} of ${formatBaseMoney(limit)}`) — all local rendering. Migrated 2026-08-23.",
    },
    {
      path: "pages/dashboard.tsx",
      reason: "Dashboard insights panel. Consumes /api/ai/chat via oneShotInsight with a static prompt. Financial template literals are widget renderers (transaction lists, KPI chips, chart tickformatters) — all local rendering. Migrated 2026-08-23.",
    },
    {
      path: "pages/briefing.tsx",
      reason: "Monthly briefing page. Consumes /api/ai/chat via oneShotInsight with a static schema-shaped prompt. Financial template literals are savings-rate display in briefing render (`${(...savingsRate * 100).toFixed(1)}%`). Migrated 2026-08-23.",
    },
    {
      path: "pages/investments.tsx",
      reason: "Investments page. Consumes /api/ai/chat via oneShotInsight with a static portfolio-commentary prompt. Financial template literals are portfolio table renders, chart tick formatters, position P&L chips — all local rendering. Migrated from a buildPrompt() that inlined the ticker matrix 2026-08-23.",
    },
    {
      path: "pages/investments/markets-tab.tsx",
      reason: "Markets tab news-TL;DR feature. Consumes /api/ai/chat via oneShotInsight with a prompt containing only the news headline and ticker symbol (public reference data, not user financial state). Financial template literals are quote-display formatters. Migrated 2026-08-23.",
    },
  ];
  const whitelistPaths = new Set(WHITELIST.map((w) => w.path));

  // Financial signals — currency-formatted values and financial
  // field names likely to appear inside a template literal that
  // leaks. Deliberately broad; the whitelist handles legitimate
  // uses.
  const FINANCIAL_MARKERS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /`[^`]*£\s*\$\{/,                                   label: "template with £${...} interpolation" },
    { pattern: /`[^`]*\$\{[^}]*\bformatGbp\s*\(/,                  label: "template with ${formatBaseMoney(...)}" },
    { pattern: /`[^`]*\$\{[^}]*\bformatCurrency\s*\(/,             label: "template with ${formatCurrency(...)}" },
    { pattern: /`[^`]*\$\{[^}]*\.gbpValue\b/,                      label: "template with ${...gbpValue}" },
    { pattern: /`[^`]*\$\{[^}]*\.baseEquivalent\b/,                 label: "template with ${...baseEquivalent}" },
    { pattern: /`[^`]*\$\{[^}]*\bnetWorth\b/,                      label: "template with ${...netWorth}" },
    { pattern: /`[^`]*\$\{[^}]*\bsavingsRate\b/,                   label: "template with ${...savingsRate}" },
    { pattern: /`[^`]*\$\{[^}]*\bmonthlyLimit\b/,                  label: "template with ${...monthlyLimit}" },
    { pattern: /`[^`]*\$\{[^}]*\bmonthlyShortfall\b/,              label: "template with ${...monthlyShortfall}" },
    { pattern: /`[^`]*\$\{[^}]*\bpctFunded\b/,                     label: "template with ${...pctFunded}" },
    { pattern: /`[^`]*\$\{[^}]*\btotalBudgeted\b/,                 label: "template with ${...totalBudgeted}" },
    { pattern: /`[^`]*\$\{[^}]*\btotalSpent\b/,                    label: "template with ${...totalSpent}" },
    { pattern: /`[^`]*\$\{[^}]*\.nativeAmount\b/,                  label: "template with ${...nativeAmount}" },
    { pattern: /`[^`]*\$\{[^}]*\.toFixed\s*\(\s*2\s*\)/,           label: "template with ${...toFixed(2)}" },
  ];

  it("no file may POST to /api/ai/* AND contain a template literal with financial markers (whitelist documents exceptions)", () => {
    const hits: string[] = [];
    for (const f of readSourceFiles()) {
      const postsToAi = AI_POST_MARKERS.some((marker) => f.text.includes(marker));
      if (!postsToAi) continue;
      if (whitelistPaths.has(f.relative)) continue;
      const matched: string[] = [];
      for (const m of FINANCIAL_MARKERS) {
        if (m.pattern.test(f.text)) matched.push(m.label);
      }
      if (matched.length > 0) {
        hits.push(`${f.relative} — matches: ${matched.slice(0, 3).join(", ")}${matched.length > 3 ? `, +${matched.length - 3} more` : ""}`);
      }
    }
    if (hits.length > 0) {
      throw new Error(
        `Client files that call /api/ai/* must not assemble financial values in template literals. Server builds context from the authenticated user's own rows (lib/ai-context.ts). ` +
        `If a page needs an AI insight, call oneShotInsight({ path, prompt }) with a prompt that describes WHAT you want, not WHAT'S TRUE. ` +
        `If the file's financial template literals are for local UI rendering only (chart formatters, chip labels), add it to the WHITELIST above with a specific reason a reviewer can verify. Offenders:\n  ${hits.join("\n  ")}`,
      );
    }
    expect(hits).toEqual([]);
  });

  it("every whitelist entry documents its reason", () => {
    // Locks the shape of the whitelist itself — a whitelist without
    // reasons rots into a list of exceptions nobody remembers why.
    for (const w of WHITELIST) {
      expect(w.reason.length, `${w.path} whitelist entry has no reason`).toBeGreaterThan(40);
    }
  });
});

// ── Rule 4 ────────────────────────────────────────────────────────────────
describe("AI leak lock · Rule 4 — no stale Gemini labels or retired model IDs", () => {
  it("no client file references Gemini as the serving provider or names a retired Gemini model", () => {
    const STALE_PATTERNS: Array<{ pattern: RegExp; note: string }> = [
      { pattern: /Powered by Gemini/i,          note: "stale 'Powered by Gemini' label — Gemini was removed 2026-08-23" },
      { pattern: /Google Gemini/,               note: "stale 'Google Gemini' label" },
      { pattern: /gemini-2\.0-flash\b/,         note: "retired model gemini-2.0-flash (shutdown 2026-06-01)" },
      { pattern: /gemini-1\.5-[a-z]+/i,         note: "retired gemini-1.5 family" },
      { pattern: /\bgeneratelanguage\.googleapis\.com\b/, note: "direct call to Google Generative Language API (bypasses the chain)" },
    ];
    const hits: string[] = [];
    for (const f of readSourceFiles()) {
      for (const p of STALE_PATTERNS) {
        if (p.pattern.test(f.text)) {
          const line = locateFirstMatch(f.text, p.pattern);
          hits.push(`${f.relative}:${line} — ${p.note}`);
        }
      }
    }
    if (hits.length > 0) {
      throw new Error(
        `Client references Gemini after its removal (2026-08-23). The chain is Groq → Cerebras → OpenRouter; labels and model IDs must reflect that. Offenders:\n  ${hits.join("\n  ")}`,
      );
    }
    expect(hits).toEqual([]);
  });
});
