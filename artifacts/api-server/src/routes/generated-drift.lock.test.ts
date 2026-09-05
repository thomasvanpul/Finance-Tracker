// generated-drift.lock.test.ts
//
// WHAT THIS GUARDS
//
// lib/api-client-react/src/generated/** and lib/api-zod/src/generated/**
// are orval output from lib/api-spec/openapi.yaml. They are committed, so
// nothing stops a hand edit: 84f4dff added transferGroupId/transferDirection
// straight into lib/api-zod/src/generated/api.ts. A hand edit lives until
// the next `pnpm codegen` wipes it, and the spec-server contract lock next
// door cannot see it — that lock compares spec routes to server handlers,
// not spec output to committed output.
//
// This lock regenerates the two trees into a throwaway root (orval.config.ts
// honours ORVAL_OUT_ROOT) and asserts the committed trees are byte-identical
// to the fresh output: same file set, same contents. A field added by hand,
// a file deleted by hand, a spec change without a codegen run — each fails
// here with the file and the first differing line named.
//
// If it fails, the fix is `pnpm --filter @workspace/api-spec codegen` and a
// commit of the result — or, if the hand edit was the intent, the same
// change made in openapi.yaml first. Never edit this file to make a drifted
// tree pass.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// This file sits at artifacts/api-server/src/routes/ — four levels up is repo root.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const SPEC_DIR = join(REPO_ROOT, "lib", "api-spec");
const ORVAL_BIN = join(SPEC_DIR, "node_modules", ".bin", "orval");

// Both generated trees, relative to a root. The mutator orval imports from
// the react-query output has to exist in the temp root too, or orval
// refuses to run; it is copied, never generated, so it is not compared.
const GENERATED_TREES = ["lib/api-client-react/src/generated", "lib/api-zod/src/generated"] as const;
const MUTATOR = "lib/api-client-react/src/custom-fetch.ts";

// Every file under `dir`, keyed by path relative to `dir`, valued by content.
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.set(relative(dir, full), readFileSync(full, "utf8"));
    }
  };
  walk(dir);
  return out;
}

function firstDifferingLine(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return `line ${i + 1}: committed ${JSON.stringify(la[i] ?? "<EOF>")} vs regenerated ${JSON.stringify(lb[i] ?? "<EOF>")}`;
    }
  }
  return "(contents differ only in trailing newline)";
}

function regenerateInto(outRoot: string): void {
  mkdirSync(dirname(join(outRoot, MUTATOR)), { recursive: true });
  copyFileSync(join(REPO_ROOT, MUTATOR), join(outRoot, MUTATOR));
  const run = spawnSync(ORVAL_BIN, ["--config", "./orval.config.ts"], {
    cwd: SPEC_DIR,
    env: { ...process.env, ORVAL_OUT_ROOT: outRoot },
    encoding: "utf8",
  });
  if (run.status !== 0) {
    throw new Error(`orval exited ${run.status}\n${run.stdout}\n${run.stderr}`);
  }
}

describe("generated client drift lock", () => {
  it(
    "committed lib/*/src/generated/** is byte-identical to a fresh orval run over openapi.yaml",
    () => {
      expect(existsSync(ORVAL_BIN), `orval binary missing at ${ORVAL_BIN} — run pnpm install`).toBe(true);

      // tmp/ at the repo root is gitignored; a temp root under it resolves
      // prettier config exactly as the real output paths do, so formatting
      // cannot be the source of a diff.
      mkdirSync(join(REPO_ROOT, "tmp"), { recursive: true });
      const outRoot = mkdtempSync(join(REPO_ROOT, "tmp", "generated-drift-"));
      try {
        regenerateInto(outRoot);

        const problems: string[] = [];
        for (const tree of GENERATED_TREES) {
          const committed = snapshot(join(REPO_ROOT, tree));
          const fresh = snapshot(join(outRoot, tree));

          for (const file of committed.keys()) {
            if (!fresh.has(file)) problems.push(`${tree}/${file}: committed but not produced by codegen`);
          }
          for (const file of fresh.keys()) {
            if (!committed.has(file)) problems.push(`${tree}/${file}: produced by codegen but not committed`);
          }
          for (const [file, content] of committed) {
            const regenerated = fresh.get(file);
            if (regenerated !== undefined && regenerated !== content) {
              problems.push(`${tree}/${file}: ${firstDifferingLine(content, regenerated)}`);
            }
          }
        }

        expect(
          problems,
          [
            "Committed generated output differs from a fresh codegen run.",
            "Run `pnpm --filter @workspace/api-spec codegen` and commit the result;",
            "if the difference was a hand edit, make it in lib/api-spec/openapi.yaml first.",
            ...problems,
          ].join("\n"),
        ).toEqual([]);
      } finally {
        rmSync(outRoot, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
