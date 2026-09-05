// Lock: every localStorage key in the source tree is classified.
//
// The stranded-keys problem (BACKLOG § G20) grew one unclassified key
// at a time. This test walks src/ for localStorage call sites (and the
// two page-local helpers that wrap them), resolves each key from a
// string literal, a same-file constant, or a template prefix, and fails
// when a key is not in exactly one class in account-storage-keys.ts —
// or when a listed key no longer exists anywhere, so the list cannot
// rot in the other direction either.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALL_LISTED_KEYS,
  KEY_PREFIXES,
  classifyKey,
} from "./account-storage-keys";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

// Call sites whose key argument is a parameter, not a constant — the
// helper is the choke point, so its callers' literals are scanned
// instead (HELPER_CALL below). Listed by file so a new dynamic site
// anywhere else fails loudly.
const DYNAMIC_SITES: Record<string, readonly string[]> = {
  "pages/settings.tsx": ["key", "k"],          // ls / lsBool / lsSet helpers
  "pages/profile.tsx": ["key"],                // readPref / writePref helpers
  "pages/family-finance.tsx": ["key"],         // loadLS / saveLS over the four ft-family-* consts
  "components/persona-quick-start.tsx": ["dismissedKey", "doneKey"], // qsDismissedKey()/qsDoneKey() → ft-qs-* (onboarding)
  "lib/native-storage.ts": ["key"],            // unused wrapper (no callers)
  "lib/account-storage.ts": ["key", "k", "name"], // the sync engine itself
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const LS_CALL = /localStorage\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*([^,)]+)/g;
const HELPER_CALL = /\b(?:ls|lsBool|lsSet|readPref|writePref|loadLS|saveLS)\(\s*(["'][^"']+["']|[A-Za-z_$][\w$]*)\s*[,)]/g;
// `export const X = "…"` anywhere in src — for keys defined in one
// module and used from another (LS_REBALANCE_KEY, LS_ONBOARDING_FOLLOWUP_KEY).
const EXPORTED_CONST = /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::\s*[\w<>\[\]| ]+)?\s*=\s*(["'`][^"'`\n]*["'`])/g;
// Any template literal that starts with a key-shaped prefix, anywhere —
// how a dynamic key is built even when the localStorage call is elsewhere.
const TEMPLATE_PREFIX = /`([a-z][a-z0-9:_.-]*[-:])\$\{/g;
const STRING_LIT = /^["']([^"']+)["']$/;
const TEMPLATE = /^`([^`$]*)\$\{/;

interface Site { file: string; expr: string }
interface Resolved { key: string; file: string; template: boolean }

function resolve(site: Site, source: string, exported: ReadonlyMap<string, string>): Resolved | null {
  const expr = site.expr.trim();
  const lit = STRING_LIT.exec(expr);
  if (lit) return { key: lit[1], file: site.file, template: false };
  const tpl = TEMPLATE.exec(expr);
  if (tpl) return { key: tpl[1], file: site.file, template: true };
  if (/^[A-Za-z_$][\w$]*$/.test(expr)) {
    const constant = new RegExp(`\\b${expr}\\s*(?::\\s*[\\w<>\\[\\]| ]+)?\\s*=\\s*(["'\`][^"'\`\\n]*["'\`])`).exec(source);
    if (constant) return resolve({ file: site.file, expr: constant[1] }, source, exported);
    const imported = exported.get(expr);
    if (imported) return resolve({ file: site.file, expr: imported }, source, exported);
  }
  return null;
}

function scan(): { resolved: Resolved[]; dynamic: Site[]; prefixes: Set<string> } {
  const resolved: Resolved[] = [];
  const dynamic: Site[] = [];
  const prefixes = new Set<string>();
  const files = walk(SRC).map((file) => ({ rel: relative(SRC, file), source: readFileSync(file, "utf8") }));
  const exported = new Map<string, string>();
  for (const { rel, source } of files) {
    if (rel === "lib/account-storage-keys.ts") continue;
    for (const m of source.matchAll(EXPORTED_CONST)) exported.set(m[1], m[2]);
    for (const m of source.matchAll(TEMPLATE_PREFIX)) prefixes.add(m[1]);
  }
  for (const { rel, source } of files) {
    if (rel === "lib/account-storage-keys.ts") continue;
    const sites: Site[] = [];
    for (const m of source.matchAll(LS_CALL)) sites.push({ file: rel, expr: m[1] });
    for (const m of source.matchAll(HELPER_CALL)) sites.push({ file: rel, expr: m[1] });
    for (const site of sites) {
      const r = resolve(site, source, exported);
      if (r) resolved.push(r);
      else dynamic.push(site);
    }
  }
  return { resolved, dynamic, prefixes };
}

describe("localStorage key classification lock", () => {
  const { resolved, dynamic, prefixes } = scan();

  it("finds the call sites at all (guards the scanner, not the app)", () => {
    expect(resolved.length).toBeGreaterThan(80);
    expect(resolved.some((r) => r.key === "ft-tx-notes")).toBe(true);
    expect(resolved.some((r) => r.key === "nr-mask-mode")).toBe(true);
  });

  it("every resolved key is classified", () => {
    const unclassified = resolved
      .filter((r) => (r.template ? !KEY_PREFIXES.some((p) => p.prefix === r.key) : classifyKey(r.key) === null))
      .map((r) => `${r.key}${r.template ? "${…}" : ""}  <- ${r.file}`);
    expect([...new Set(unclassified)]).toEqual([]);
  });

  it("every dynamic call site is a known helper or wrapper", () => {
    const unknown = dynamic
      .filter((s) => !(DYNAMIC_SITES[s.file] ?? []).includes(s.expr.trim()))
      .map((s) => `${s.file}: ${s.expr.trim()}`);
    expect([...new Set(unknown)]).toEqual([]);
  });

  it("no key is listed twice, and every listed key still exists in the source", () => {
    const seen = new Set<string>();
    const dupes = ALL_LISTED_KEYS.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
    expect(dupes).toEqual([]);
    const present = new Set(resolved.filter((r) => !r.template).map((r) => r.key));
    // The engine's own bookkeeping keys are written through the raw
    // Storage methods captured at install time, not localStorage.x(),
    // so the scanner cannot see them; they are asserted by name.
    const engineOwned = new Set(["nr-prefs-owner", "nr-prefs-pending", "nr-prefs-shadow-v1"]);
    const stale = ALL_LISTED_KEYS.filter((k) => !present.has(k) && !engineOwned.has(k));
    expect(stale).toEqual([]);
    expect(KEY_PREFIXES.filter((p) => !prefixes.has(p.prefix)).map((p) => p.prefix)).toEqual([]);
  });
});
