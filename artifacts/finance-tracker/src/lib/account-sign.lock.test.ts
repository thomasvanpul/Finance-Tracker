// account-sign.lock.test.ts
//
// WHAT THIS GUARDS
//
// An account row stores a POSITIVE balance and lets `type` carry the sign: a
// `liability` of 6,800 is £6,800 owed, not £6,800 held
// (lib/db/src/schema/accounts.ts states it on the column). Anything that sums,
// sorts, ranks or charts a COLLECTION of accounts must therefore apply the
// type before it applies arithmetic.
//
// Between 2026-09-10 and 2026-09-11 that was got wrong three times in three
// different files, each found by accident:
//
//   dashboard net worth        a liability added instead of subtracted (4d0aa9a)
//   accounts widget footer     rows summed raw under a total that excluded them
//   accounts widget sort       a £6,800 loan ranked between £8,100 and £2,450
//                              in a column that is supposed to descend
//
// Each was fixed in isolation. `lib/account-sign.ts` was created so a fourth
// list could not re-derive it — but a module only helps the callers who
// remember to call it, and twenty-one further sites did not.
//
// WHAT THIS LOCK CAN AND CANNOT DO — read before trusting it
//
// "Sums a collection of accounts" is not a string. It is a property of a
// value, and a regex scanner has no types. A lock that only matched the exact
// shapes present on the day it was written would certify tomorrow's defect,
// so this one is deliberately built the other way round: it recognises
// ACCOUNT-DERIVED IDENTIFIERS, then requires that arithmetic over them goes
// through the shared rule.
//
// An identifier is account-derived when any of these hold (RULE V keeps the
// first honest):
//
//   1. its name matches /account/i
//   2. it is declared with a type annotation naming `Account` or containing
//      `baseEquivalent` — this is what catches `breakdown` in dashboard.ts,
//      whose name says nothing
//   3. it is assigned from an expression mentioning one of the above
//      (three fixpoint rounds, so `accounts` → `withBase` → `owedAccounts`)
//
// What it does NOT do, stated plainly rather than left to be discovered:
//
//   - it is single-file. A collection of accounts passed into a helper in
//     another module, as a parameter typed `T[]`, is invisible to it.
//   - it reads `.reduce(` and `.sort(` only. A hand-rolled `for` loop with
//     `+=` is not caught. That is a real hole; it is narrower than it looks
//     because both such loops in this tree (WorthScreen.tsx, ai-context.ts)
//     already go through the rule, and widening the scanner to every `+=`
//     produced 40 transaction-sum false positives, which is how a lock gets
//     switched off.
//   - it cannot tell a CORRECT raw sum from an incorrect one. That is what
//     the allowlist is for, and every entry carries the reason it is there.
//
// So this is the narrower lock plus an allowlist, not a general one. The
// counts asserted at the bottom are what make it hold: a silent addition
// fails as loudly as the pattern it was hiding.
//
// If this test fails, fix the call site. Do NOT add an allowlist entry to
// make it pass.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = join(HERE, "..", "..", "..");
// Both runtimes. The client and the API each state the sign rule once, and
// RULE P below asserts the two statements have not drifted apart.
const TREES = [
  { root: join(ARTIFACTS, "finance-tracker", "src"), label: "finance-tracker" },
  { root: join(ARTIFACTS, "api-server", "src"), label: "api-server" },
];

const SKIP_DIR = new Set(["node_modules", "dist", "generated", "__snapshots__"]);

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        if (!SKIP_DIR.has(e)) walk(p);
      } else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) {
        out.push(p);
      }
    }
  };
  walk(root);
  return out;
}

// Comments are stripped so the prose in this file and in account-sign.ts may
// quote the banned forms without tripping the scan. String literals are
// blanked for the same reason, and because a `//` inside a URL would
// otherwise read as a comment.
//
// The apostrophe rule is load-bearing. JSX text is NOT a string literal, so a
// possessive in markup — `Thomas's accounts` — opens a quote that never
// closes, and a stripper that trusts it swallows every line to the next
// apostrophe in the file. That is not hypothetical: it silently ate the two
// known-good sites in pages/accounts.tsx, and the scan went quietly green on
// a file it had stopped reading. A quote therefore only opens a string when
// its partner is on the SAME line; a real literal almost always is, a JSX
// possessive almost never. Template literals may span lines, so backticks
// keep the multi-line behaviour.
//
// The "every allowlist entry still corresponds to a real match" test below is
// the canary for this: if the stripper desyncs again, entries stop matching
// and that test fails rather than the scan passing on nothing.
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  const closesOnSameLine = (from: number, q: string): boolean => {
    for (let j = from; j < n; j++) {
      if (src[j] === "\n") return false;
      if (src[j] === "\\") { j++; continue; }
      if (src[j] === q) return true;
    }
    return false;
  };
  while (i < n) {
    const c = src[i]!, d = src[i + 1];
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") { i++; } continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      i += 2; continue;
    }
    if (c === "`" || ((c === '"' || c === "'") && closesOnSameLine(i + 1, c))) {
      out += c; i++;
      while (i < n && src[i] !== c) {
        if (src[i] === "\\") { out += " "; i++; }
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      out += c; i++; continue;
    }
    out += c; i++;
  }
  return out;
}

const ACCOUNTISH = /account/i;

/** The type annotation that follows a `name:` at `from`, bracket-aware. */
function annotationAt(text: string, from: number): string {
  let depth = 0;
  for (let i = from; i < text.length && i < from + 300; i++) {
    const c = text[i]!;
    if ("([{<".includes(c)) depth++;
    else if (")]}>".includes(c)) { if (depth === 0) return text.slice(from, i); depth--; }
    else if (depth === 0 && (c === "," || c === "=" || c === ";" || c === "\n")) return text.slice(from, i);
  }
  return text.slice(from, from + 300);
}

/** Identifiers in this file that hold, or are derived from, accounts. */
function accountIdents(text: string): Set<string> {
  const ids = new Set<string>();
  // (1) named for what they are.
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    if (ACCOUNTISH.test(m[1]!)) ids.add(m[1]!);
  }
  // (2) holding accounts while named something else. Two precise signals,
  //     no structural guessing: a transaction row and an account breakdown
  //     row are BOTH `{ type: string; baseEquivalent: number }`, so any rule
  //     keyed on that shape flags transaction lists as account lists — an
  //     earlier version of this did exactly that in pages/reports.tsx.
  //
  //     2a — the annotation names the Account type.
  for (const m of text.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*/g)) {
    if (/\bAccount\b/.test(annotationAt(text, m.index! + m[0].length))) ids.add(m[1]!);
  }
  //     2b — it is a parameter of a function whose NAME is about accounts.
  //     `assetAccountsTotal(breakdown)` in routes/dashboard.ts is the case
  //     this exists for: the parameter says nothing, the function says
  //     everything.
  for (const m of text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]{0,120}>)?\s*\(/g)) {
    if (!ACCOUNTISH.test(m[1]!)) continue;
    const params = argsAt(text, m.index! + m[0].length - 1);
    for (const q of params.matchAll(/(?:^|[,(])\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*[:,)]/g)) {
      ids.add(q[1]!);
    }
  }

  // (3) derived by a collection transform of something already known.
  //     Deliberately narrow: the FIRST identifier on the right-hand side must
  //     itself be an account. `accounts ?? []`, `accounts!.filter(…)` and
  //     `[...accounts]` all derive; `useMemo(() => buildProjection(…))` does
  //     not, and an earlier, looser version of this rule that walked every
  //     identifier on the right dragged in transaction and debt collections
  //     three hops away and reported six false positives.
  for (let round = 0; round < 3; round++) {
    for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]{0,120})?=\s*([^;]{0,400})/g)) {
      const name = m[1]!;
      if (ids.has(name)) continue;
      const first = /^\s*\(?\s*(?:await\s+)?(?:\[\s*\.\.\.\s*)?\(?\s*([A-Za-z_$][\w$]*)/.exec(m[2]!);
      if (first && ids.has(first[1]!)) ids.add(name);
    }
  }
  return ids;
}

/** The expression immediately left of `index`, walked back over balanced brackets. */
function receiverBefore(text: string, index: number): string {
  let i = index - 1;
  const closers: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  while (i >= 0) {
    const c = text[i]!;
    if (/\s/.test(c)) { i--; continue; }
    if (c in closers) {
      const open = closers[c]!;
      let depth = 0;
      while (i >= 0) {
        const ch = text[i]!;
        if (ch === c) depth++;
        else if (ch === open) { depth--; if (depth === 0) { i--; break; } }
        i--;
      }
      continue;
    }
    if (/[\w$.!?]/.test(c)) { i--; continue; }
    break;
  }
  return text.slice(i + 1, index);
}

/** The balanced argument list starting at the `(` at `open`. */
function argsAt(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i]!;
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return text.slice(open + 1);
}

// `.reduce<number>(` is idiomatic TypeScript and routes/dashboard.ts uses it.
// The first version of this scanner required `(` immediately after the method
// name, so it walked straight past assetAccountsTotal — the one server
// function whose whole job is this rule. Caught by deliberately reintroducing
// the defect there; the generic group is why it is caught now.
const READS_AMOUNT = /\.(baseEquivalent|balance)\b/;
const GOES_THROUGH_RULE = /signedAccountAmount|netAccountsTotal/;

interface Violation { tree: string; file: string; rule: "SUM" | "ORDER"; line: number; text: string }

function scanTree(root: string, label: string): Violation[] {
  const found: Violation[] = [];
  for (const path of sourceFiles(root)) {
    const file = relative(root, path);
    const text = stripComments(readFileSync(path, "utf8"));
    const idents = accountIdents(text);
    if (idents.size === 0) continue;

    for (const m of text.matchAll(/\.(reduce|sort)\s*(?:<[^>()]{0,120}>)?\s*\(/g)) {
      const callOpen = text.indexOf("(", m.index! + 1);
      const recv = receiverBefore(text, m.index!);
      const hit = [...recv.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)]
        .map((t) => t[1]!).find((t) => idents.has(t));
      if (!hit) continue;
      const args = argsAt(text, callOpen);
      if (!READS_AMOUNT.test(args)) continue;
      if (GOES_THROUGH_RULE.test(args)) continue;
      found.push({
        tree: label,
        file,
        rule: m[1] === "reduce" ? "SUM" : "ORDER",
        line: text.slice(0, m.index!).split("\n").length,
        // Name the identifier that put this line in scope. Without it a
        // false positive is a guessing game about which of a dozen words on
        // the line the scanner thought was a collection of accounts.
        text: `via \`${hit}\` — ` + recv.trim().replace(/\s+/g, " ").slice(-70) + "." + m[1] + "(…)",
      });
    }
  }
  return found;
}

// ── The allowlist ───────────────────────────────────────────────────────────
//
// Every entry is a place that reads an account amount raw ON PURPOSE. Each
// says why in its own words. `status` separates the two kinds: `correct` is
// settled, `deferred-bug` is a known defect left out of scope and recorded as
// a finding — if one is fixed, delete its entry and drop the count together.

type Status = "correct" | "deferred-bug";
interface Allowed { tree: string; file: string; rule: "SUM" | "ORDER"; status: Status; why: string }

const ALLOWLIST: readonly Allowed[] = [
  {
    tree: "finance-tracker", file: "pages/accounts.tsx", rule: "SUM", status: "correct",
    why: "liabilitiesTotal deliberately returns a POSITIVE magnitude from a liability-only filter, so the strip can label it and subtract it explicitly — the same two-term split routes/dashboard.ts keeps so the response identity holds. A signed sum here would net the loan into a figure captioned Cash.",
  },
  {
    tree: "finance-tracker", file: "pages/accounts.tsx", rule: "ORDER", status: "correct",
    why: "The allocation bar and its top-5 list rank ASSETS only — liabilities are filtered out one line above, because a share of a total cannot be drawn as a negative-width segment. Every element reaching this sort is therefore an asset, whose signed value equals its raw value.",
  },
  {
    tree: "api-server", file: "routes/dashboard.ts", rule: "SUM", status: "correct",
    why: "The API deliberately keeps the two terms APART instead of netting them: spendableCashTotal filters to `type = cash` (an overdraft belongs, as a negative; a loan does not), assetAccountsTotal excludes liabilities and liabilityAccountsTotal returns their positive magnitude. Netting at the source would make a field named Cash fall when a loan is entered and would break the documented response identity netWorth == totalCash + portfolio + owing - totalLiabilities. All three take the type from isLiabilityType/`cash` explicitly, so the rule is applied, just not as a signed sum.",
  },
  {
    tree: "finance-tracker", file: "components/mobile/MobileAccounts.tsx", rule: "SUM", status: "correct",
    why: "The same liability-only `owed` magnitude as accounts-summary.tsx, in a component with ZERO importers — it ships to nobody. Kept because deleting it is Thomas's call, not a cleanup, and locked here so the dead copy cannot drift into a live one carrying the defect back.",
  },
  {
    tree: "finance-tracker", file: "components/widgets/accounts-summary.tsx", rule: "SUM", status: "correct",
    why: "`owed` sums liabilities only and wants the positive magnitude to print beside a minus glyph. Lock #19 (sign-glyph) requires that a glyph-prefixed formatter argument IS a magnitude, so signing this one would render −−£6,800.00.",
  },
];

const allowed = (v: Violation): boolean =>
  ALLOWLIST.some((a) => a.tree === v.tree && a.file === v.file && a.rule === v.rule);

// ── The lock ────────────────────────────────────────────────────────────────

describe("every list that sums or orders accounts goes through the shared sign rule", () => {
  const violations = TREES.flatMap((t) => scanTree(t.root, t.label));

  it("walks both trees, so a broken scan cannot pass silently", () => {
    for (const t of TREES) expect(sourceFiles(t.root).length).toBeGreaterThan(30);
  });

  it("RULE SUM — a reduce over accounts reading balance/baseEquivalent uses the rule", () => {
    const bad = violations.filter((v) => v.rule === "SUM" && !allowed(v));
    expect(bad.map((v) => `${v.tree}/${v.file}:${v.line}  ${v.text}`)).toEqual([]);
  });

  it("RULE ORDER — a sort over accounts comparing balance/baseEquivalent uses the rule", () => {
    const bad = violations.filter((v) => v.rule === "ORDER" && !allowed(v));
    expect(bad.map((v) => `${v.tree}/${v.file}:${v.line}  ${v.text}`)).toEqual([]);
  });

  it("RULE V — every useListAccounts binding is named so the scanner can see it", () => {
    // RULES SUM and ORDER recognise a collection largely by its NAME. That is
    // only sound while the naming convention holds, so the convention is
    // itself locked: bind accounts to a name containing "account" and the
    // scanner follows it into every derived local. Bind it to `rows` and the
    // scan goes blind — which fails HERE, at the binding, rather than
    // silently three screens later.
    const offenders: string[] = [];
    for (const t of TREES) {
      for (const path of sourceFiles(t.root)) {
        const text = stripComments(readFileSync(path, "utf8"));
        for (const m of text.matchAll(/(?:const|let)\s*(?:\{\s*data\s*:\s*)?([A-Za-z_$][\w$]*)[^=;]{0,80}=\s*useListAccounts\s*\(/g)) {
          if (!ACCOUNTISH.test(m[1]!)) {
            offenders.push(`${t.label}/${relative(t.root, path)}  ${m[1]}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("RULE P — the client and server statements of the rule have not drifted", () => {
    // The two runtimes share no workspace package, so the rule is stated
    // once per runtime (artifacts/*/src/lib/account-sign.ts). Duplication
    // across that boundary is acceptable ONLY while a test holds the two
    // copies identical; this is that test.
    const body = (src: string, fn: string): string | null => {
      const text = stripComments(src);
      const i = text.indexOf(`export function ${fn}`);
      if (i === -1) return null;
      const open = text.indexOf("{", text.indexOf(")", i));
      let depth = 0;
      for (let j = open; j < text.length; j++) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") { depth--; if (depth === 0) return text.slice(i, j + 1).replace(/\s+/g, " ").trim(); }
      }
      return null;
    };
    const client = readFileSync(join(TREES[0]!.root, "lib", "account-sign.ts"), "utf8");
    const server = readFileSync(join(TREES[1]!.root, "lib", "account-sign.ts"), "utf8");
    for (const fn of ["isLiabilityType", "signedAccountAmount"]) {
      expect(body(client, fn), `${fn} missing from a runtime`).not.toBeNull();
      expect(body(server, fn)).toEqual(body(client, fn));
    }
  });

  it("catches the defects it was written for", () => {
    // A regression guard on the SCANNER, not on the tree. If these stop
    // matching, the lock has been defanged and the tests above would pass on
    // a tree that had every defect back.
    const probe = (src: string) => scanSource(src);
    expect(probe(`const accounts = useListAccounts();
      const total = accounts.reduce((s, a) => s + (a.baseEquivalent ?? 0), 0);`))
      .toHaveLength(1);
    expect(probe(`const accounts = useListAccounts();
      const sorted = [...accounts].sort((a, b) => b.baseEquivalent - a.baseEquivalent);`))
      .toHaveLength(1);
    // Derived through two hops, the shape accounts.tsx uses.
    expect(probe(`const accounts = useListAccounts();
      const withBase = accounts.filter(a => a.baseEquivalent != null);
      const owed = withBase.filter(a => a.baseEquivalent < 0);
      const t = owed.reduce((s, a) => s + a.balance, 0);`))
      .toHaveLength(1);
    // A parameter named nothing like an account, in a function that is —
    // the assetAccountsTotal/breakdown shape in routes/dashboard.ts.
    expect(probe(`function assetAccountsTotal(breakdown: readonly { type: string; baseEquivalent: number | null }[]) {
      return breakdown.reduce((s, a) => s + (a.baseEquivalent ?? 0), 0); }`))
      .toHaveLength(1);
    // ...and the same body under a name that is NOT about accounts stays
    // invisible. This asserts the scanner's blind spot rather than pretending
    // it does not have one: a transaction row and an account breakdown row
    // are both `{ type: string; baseEquivalent: number }`, so nothing here
    // can tell them apart by shape, and guessing flagged real transaction
    // lists in pages/reports.tsx.
    expect(probe(`function total(rows: readonly { type: string; baseEquivalent: number | null }[]) {
      return rows.reduce((s, a) => s + (a.baseEquivalent ?? 0), 0); }`))
      .toEqual([]);
    // And does not fire on the legitimate forms.
    expect(probe(`const accounts = useListAccounts();
      const total = netAccountsTotal(accounts);`)).toEqual([]);
    expect(probe(`const accounts = useListAccounts();
      const t = accounts.reduce((s, a) => s + (signedAccountAmount(a.type, a.baseEquivalent) ?? 0), 0);`))
      .toEqual([]);
    // A transaction sum is not an account sum.
    expect(probe(`const txs = useListTransactions();
      const total = txs.reduce((s, t) => s + t.baseEquivalent, 0);`)).toEqual([]);
  });

  it("every allowlist entry still corresponds to a real match", () => {
    // An entry matching nothing has outlived its site. Delete it rather than
    // leaving a licence lying around.
    const stale = ALLOWLIST.filter((a) =>
      !violations.some((v) => v.tree === a.tree && v.file === a.file && v.rule === a.rule));
    expect(stale.map((a) => `${a.tree}/${a.file} ${a.rule}`)).toEqual([]);
  });

  it("the allowlist has not grown", () => {
    expect(ALLOWLIST.filter((a) => a.status === "correct")).toHaveLength(5);
    expect(ALLOWLIST.filter((a) => a.status === "deferred-bug")).toHaveLength(0);
    for (const a of ALLOWLIST) expect(a.why.length).toBeGreaterThan(80);
  });
});

/** Scan a source string in isolation — used only by the regression guard. */
function scanSource(src: string): Violation[] {
  const text = stripComments(src);
  const idents = accountIdents(text);
  const found: Violation[] = [];
  for (const m of text.matchAll(/\.(reduce|sort)\s*(?:<[^>()]{0,120}>)?\s*\(/g)) {
    const callOpen = text.indexOf("(", m.index! + 1);
    const recv = receiverBefore(text, m.index!);
    if (![...recv.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)].some((t) => idents.has(t[1]!))) continue;
    const args = argsAt(text, callOpen);
    if (!READS_AMOUNT.test(args)) continue;
    if (GOES_THROUGH_RULE.test(args)) continue;
    found.push({ tree: "probe", file: "probe", rule: m[1] === "reduce" ? "SUM" : "ORDER", line: 0, text: recv });
  }
  return found;
}
