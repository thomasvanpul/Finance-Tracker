// Lock #17 · no raw fetch("/api/…") in the SPA source tree (G13 · 5/5).
//
// ── The specific defect this stops ─────────────────────────────────────────
// A `fetch("/api/foo")` in the client works on web (Vercel rewrites /api/*
// to the Render service) and silently fails on native. In the Capacitor
// iOS shell the WebView origin is `capacitor://localhost`; a relative
// /api path resolves inside the local bundle, never reaches a server,
// and better-auth reports server_error. That was the shape of the G13
// investigation this session — nine sites, none of them noticed at
// review time because the on-web path worked.
//
// The retrofit in G13 · 3/5 replaced each raw fetch with apiFetch (a
// drop-in wrapper that prepends VITE_NATIVE_API_URL and attaches the
// bearer token on native). This lock stops a new relative-/api fetch
// from silently reintroducing the same defect.
//
// ── What counts as a hit ───────────────────────────────────────────────────
// AST match on a CallExpression whose:
//   - callee is a bare `fetch` identifier (not `apiFetch`, not
//     `customFetch`, not `foo.fetch()`),
//   - first argument is a StringLiteral, NoSubstitutionTemplateLiteral,
//     or TemplateExpression whose text starts with `/api/` or with a
//     substitution followed by `/api/` (e.g. `` `${API_BASE}/api/foo` ``).
//
// Absolute URLs (`fetch("https://…")`) are not flagged — those go
// where the caller sent them. Relative paths that aren't /api/ are
// not flagged — they hit the static asset host, not the API.
//
// ── What is exempt ─────────────────────────────────────────────────────────
// One file: lib/api-fetch.ts. It IS the wrapper — its `fetch(...)`
// call is the one legitimate raw fetch in the app for /api paths.
// Anything else calling fetch on /api needs to move to apiFetch.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");
const SCAN_ROOT = join(REPO_ROOT, "artifacts", "finance-tracker", "src");

// The one file that legitimately calls raw fetch on /api paths — it
// IS the apiFetch wrapper. Anything else moves to apiFetch.
const EXEMPT_FILES: ReadonlySet<string> = new Set([
  "artifacts/finance-tracker/src/lib/api-fetch.ts",
]);

interface Hit {
  path: string;
  line: number;
  text: string;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "generated" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (
      st.isFile() &&
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".test.tsx") &&
      !full.endsWith(".spec.ts") &&
      !full.endsWith(".spec.tsx") &&
      !full.endsWith(".d.ts")
    ) {
      out.push(full);
    }
  }
  return out;
}

// Return true if the CallExpression's first argument starts with /api/
// as a string literal, template literal, or a template whose first
// substitution is followed by /api/. Anything else is not a hit.
function firstArgIsRelativeApi(node: ts.CallExpression, sf: ts.SourceFile): boolean {
  const arg = node.arguments[0];
  if (!arg) return false;
  if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
    return arg.text.startsWith("/api/");
  }
  if (ts.isTemplateExpression(arg)) {
    // Either the head starts with /api/ ("`/api/foo${x}`") or the
    // first template span's literal starts with /api/ (which comes
    // after the ${expr}, e.g. "`${BASE}/api/foo`").
    if (arg.head.text.startsWith("/api/")) return true;
    if (arg.templateSpans.length > 0) {
      const firstSpan = arg.templateSpans[0];
      if (firstSpan.literal.text.startsWith("/api/")) return true;
    }
    // Fallback: raw text of the whole template contains /api/ preceded
    // by a substitution close-brace or the opening backtick.
    const raw = arg.getText(sf);
    if (/[`}]\/api\//.test(raw)) return true;
  }
  return false;
}

function scanFile(filePath: string): Hit[] {
  const text = readFileSync(filePath, "utf-8");
  const rel = relative(REPO_ROOT, filePath);
  if (EXEMPT_FILES.has(rel)) return [];

  const sf = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.ES2020,
    /*setParentNodes*/ true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const hits: Hit[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fetch" &&
      firstArgIsRelativeApi(node, sf)
    ) {
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      hits.push({
        path: rel,
        line: line + 1,
        text: node.getText(sf).replace(/\s+/g, " ").slice(0, 120),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return hits;
}

describe("no-raw-api-fetch lock (#17)", () => {
  it("every /api call in src/ goes through apiFetch or customFetch", () => {
    const hits: Hit[] = [];
    for (const file of walk(SCAN_ROOT)) {
      hits.push(...scanFile(file));
    }
    if (hits.length === 0) return;
    const detail = hits
      .sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)))
      .map((h) => `  ${h.path}:${h.line}  ${h.text}`)
      .join("\n");
    throw new Error(
      `Lock #17 · found ${hits.length} raw fetch("/api/...") call(s) in src/:\n${detail}\n\n` +
      `Pattern: \`fetch(<literal or template that starts with /api/>)\`. In the Capacitor iOS shell the WebView origin is \`capacitor://localhost\` and a relative /api path resolves inside the local bundle — the request never reaches the server. Web works via Vercel's /api/* rewrite; native breaks silently.\n\n` +
      `Fix: replace fetch with apiFetch from @/lib/api-fetch. Same signature; on native it prepends VITE_NATIVE_API_URL and attaches Authorization: Bearer <token>, on web it is a no-op. Use apiFetch for SSE, blob downloads, and any endpoint where you want raw Response access. For endpoints already served by @workspace/api-client-react's generated hooks, no change is needed — customFetch handles the same concerns via setBaseUrl + setAuthTokenGetter.\n\n` +
      `The single legitimate exception is lib/api-fetch.ts itself (the wrapper). If a new file has a genuine reason to bypass apiFetch, add it to EXEMPT_FILES with a reviewer-facing comment — the point of a lock is that weakening it takes a visible diff.`,
    );
  });
});
