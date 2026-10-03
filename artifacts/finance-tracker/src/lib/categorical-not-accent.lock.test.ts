// Lock: on every theme, the categorical colours are not the accent.
//
// DESIGN.md §11: --ft-accent is the only colour that means "you can press
// this"; --ft-blue and --ft-cyan are categorical only. When a theme sets a
// categorical token to the same value as its accent, every chart series,
// bucket or badge drawn in that token reads as a pressable or selected
// control. On arctic, --ft-cyan was #0052CC — the accent — so the INVESTED
// bucket in the WORTH composition ring was the same blue as the selected
// RING tab beside it (finding fe521297d132).
//
// A theme that does not set a token inherits it from the top-level :root
// block, so the comparison is made on the effective value.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const INDEX_CSS = join(dirname(fileURLToPath(import.meta.url)), "..", "index.css");
const CATEGORICAL = ["--ft-blue", "--ft-cyan"] as const;

type Tokens = Record<string, string>;

function parseBlock(body: string): Tokens {
  const tokens: Tokens = {};
  for (const m of body.matchAll(/(--ft-[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    tokens[m[1]] = m[2].trim().toLowerCase();
  }
  return tokens;
}

function readThemes(): { root: Tokens; themes: Record<string, Tokens> } {
  const css = readFileSync(INDEX_CSS, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  const root: Tokens = {};
  for (const m of css.matchAll(/^:root\s*\{([^}]*)\}/gm)) Object.assign(root, parseBlock(m[1]));
  const themes: Record<string, Tokens> = {};
  for (const m of css.matchAll(/^\[data-theme="([a-z-]+)"\]\s*\{([^}]*)\}/gm)) {
    themes[m[1]] = { ...root, ...parseBlock(m[2]) };
  }
  return { root, themes };
}

describe("categorical colours are never the interactive accent (DESIGN.md §11)", () => {
  const { root, themes } = readThemes();

  it("finds the themes and the accent", () => {
    expect(root["--ft-accent"]).toBeTruthy();
    expect(Object.keys(themes).length).toBeGreaterThanOrEqual(10);
  });

  for (const [name, tokens] of Object.entries({ root, ...themes })) {
    for (const token of CATEGORICAL) {
      it(`${name}: ${token} differs from --ft-accent`, () => {
        expect(tokens[token], `${name} ${token}`).not.toBe(tokens["--ft-accent"]);
      });
    }
  }
});
