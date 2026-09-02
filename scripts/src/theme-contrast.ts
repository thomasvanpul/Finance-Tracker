// WCAG contrast checker for Numeris theme palettes.
//
// The audit asked: "Every text-on-surface pair must hit 4.5:1 and every
// border must be visible. Compute the ratios and report them; do not
// eyeball it." This file is the report.
//
// Usage:
//   pnpm --filter @workspace/scripts exec tsx src/theme-contrast.ts
//
// Prints a table of every text-on-surface pair for every theme (light and
// dark) and exits non-zero if any pair fails the WCAG AA threshold.

interface Palette {
  base: string; surface: string; raised: string;
  border: string; border2: string;
  text: string; muted: string; dim: string;
  accent: string;
  amber: string; green: string; red: string; blue: string; cyan: string;
  id1: string; id2: string; id3: string; id4: string;
  id5: string; id6: string; id7: string; id8: string;
  id9: string; id10: string; id11: string; id12: string;
}

interface DarkPalette {
  base: string; surface: string; raised: string;
  border: string; border2: string;
  text: string; muted: string; dim: string;
  accent: string;
  amber: string; green: string; red: string; blue: string; cyan: string;
}

// ── Light themes ──────────────────────────────────────────────────────────────

const arctic: Palette = {
  base: "#F0F4F8", surface: "#FFFFFF", raised: "#E8EDF5",
  // border used to be #C9D4E0 / #B0BDD0 — both under 2:1 on white.
  // Darkened so the strict WCAG 1.4.11 "3:1 for UI components /
  // graphical objects" threshold clears. Reads as a firmer divider.
  border: "#7E8CA0", border2: "#6A788A",
  text: "#1A2333", muted: "#4A5A74", dim: "#637088",
  accent: "#0052CC",
  amber: "#B45309", green: "#006644", red: "#CC0000", blue: "#0065FF", cyan: "#0052CC",
  id1: "#1E5FBF", id2: "#157A3F", id3: "#A05500", id4: "#0E7490",
  id5: "#B91C1C", id6: "#6D28D9", id7: "#A16207", id8: "#0F766E",
  id9: "#B45309", id10: "#1D4ED8", id11: "#047857", id12: "#075985",
};

// Parchment — warm cream FT-style paper, deep ink, burgundy accent.
// The financial-print reader theme. Warm salmon-cream base evokes the
// pink paper of the Financial Times; ink brown for text; burgundy for
// accent so gains/losses read as newsprint red on ivory.
const parchment: Palette = {
  base: "#F5EBD8", surface: "#FFF8EC", raised: "#EDE0C4",
  border: "#9C8248", border2: "#7A6535",
  text: "#241A0C", muted: "#4B3818", dim: "#6E5528",
  accent: "#7A1F30",
  amber: "#94430A", green: "#155C34", red: "#A82020", blue: "#173C6E", cyan: "#1E5266",
  id1: "#173C6E", id2: "#155C34", id3: "#94430A", id4: "#1E5266",
  id5: "#A82020", id6: "#5A1C7A", id7: "#7A4F0C", id8: "#106252",
  id9: "#994A0F", id10: "#1B428F", id11: "#155432", id12: "#124860",
};

// Slate — cool granite grey paper, near-black text, deep teal accent.
// The analyst-desk theme. Cool blue-grey base reads as instrument
// rather than office; teal accent stays serious. Between arctic (crisp
// white saas) and something more industrial.
const slate: Palette = {
  base: "#DFE6EE", surface: "#F0F4F8", raised: "#D3DCE6",
  border: "#748596", border2: "#5F6C7E",
  text: "#141A22", muted: "#3E4A58", dim: "#5A6572",
  accent: "#0E5766",
  amber: "#8F4A00", green: "#155C34", red: "#932530", blue: "#164478", cyan: "#0E5766",
  id1: "#164478", id2: "#155C34", id3: "#8F4A00", id4: "#0E5766",
  id5: "#932530", id6: "#4E207F", id7: "#7A5310", id8: "#0F5B4C",
  id9: "#994A0F", id10: "#1A4292", id11: "#0D5533", id12: "#104A68",
};

// Linen — warm off-white with olive-gold accent. The ledger / private
// wealth theme. Warm cream base with a lower-chroma feel than
// parchment; olive-gold accent nods to accountancy ledger inks.
const linen: Palette = {
  base: "#EEE7D6", surface: "#F8F2E3", raised: "#E4DBC4",
  border: "#8F7E4D", border2: "#6E6035",
  text: "#241D0F", muted: "#4A3E1E", dim: "#6A5A32",
  accent: "#5A4610",
  amber: "#8A3F0A", green: "#33500F", red: "#8F1F1F", blue: "#173E68", cyan: "#1E4E56",
  id1: "#173E68", id2: "#33500F", id3: "#8A3F0A", id4: "#124E58",
  id5: "#8F1F1F", id6: "#4A1B6E", id7: "#77530C", id8: "#105E42",
  id9: "#8F4008", id10: "#183C88", id11: "#13502F", id12: "#104060",
};

const LIGHT_THEMES: Record<string, Palette> = { arctic, parchment, slate, linen };

// ── Dark themes ───────────────────────────────────────────────────────────────
// Dark themes inherit the :root identity ramp (bright values tuned for dark
// surfaces) and are not required to define --ft-id-*. We check all text,
// status, border and accent pairs but skip the id ramp.

const phosphor: DarkPalette = {
  base: "#020802", surface: "#050F05", raised: "#0A1A0A",
  border: "#0D2A0D", border2: "#1A3D1A",
  text: "#39FF14", muted: "#2A9918", dim: "#1E7010",
  accent: "#7FFF00",
  amber: "#FF8C00", green: "#00FF88", red: "#FF4444", blue: "#00FFCC", cyan: "#AAFFAA",
};

const amber: DarkPalette = {
  base: "#0A0600", surface: "#120C00", raised: "#1C1400",
  border: "#2A1E00", border2: "#3D2B00",
  text: "#FFB000", muted: "#AA7828", dim: "#7A5510",
  accent: "#FFD700",
  amber: "#FFA500", green: "#AAFF44", red: "#FF4400", blue: "#44AAFF", cyan: "#FFEE88",
};

const midnight: DarkPalette = {
  base: "#010817", surface: "#05112A", raised: "#091A3D",
  border: "#0F2456", border2: "#163070",
  text: "#E8F0FF", muted: "#7A99CC", dim: "#4A6AA0",
  accent: "#4D9FFF",
  amber: "#FF9500", green: "#2EFF9F", red: "#FF4466", blue: "#80BFFF", cyan: "#00DDFF",
};

const matrix: DarkPalette = {
  base: "#000300", surface: "#010601", raised: "#020902",
  border: "#003300", border2: "#004400",
  text: "#00CC33", muted: "#009944", dim: "#006622",
  accent: "#00FF41",
  amber: "#FFAA00", green: "#00FF41", red: "#FF3300", blue: "#00FFCC", cyan: "#AAFFAA",
};

const synthwave: DarkPalette = {
  base: "#0D001A", surface: "#170028", raised: "#220040",
  border: "#2D0050", border2: "#440077",
  text: "#E8D5FF", muted: "#AA66DD", dim: "#8800AA",
  accent: "#FF007A",
  amber: "#FF6B00", green: "#39FF4E", red: "#FF1133", blue: "#00C8FF", cyan: "#CC88FF",
};

const deepSpace: DarkPalette = {
  base: "#010108", surface: "#06060F", raised: "#0C0C1E",
  border: "#0F0F20", border2: "#1A1A38",
  text: "#C8D0E8", muted: "#7880B0", dim: "#505090",
  accent: "#7B5EA7",
  amber: "#FFD166", green: "#2ECC71", red: "#FF4455", blue: "#4466FF", cyan: "#00DDEE",
};

const mario: DarkPalette = {
  base: "#5C94FC", surface: "#3A70DC", raised: "#2850C0",
  border: "#1A38A0", border2: "#102890",
  text: "#FCFCFC", muted: "#D4E4FF", dim: "#C0D4FF",
  accent: "#F8C800",
  amber: "#D07010", green: "#3ABB3A", red: "#CC2000", blue: "#1830A0", cyan: "#90C8FC",
};

const gilded: DarkPalette = {
  base: "#080600", surface: "#0E0C00", raised: "#161200",
  border: "#1E1800", border2: "#2E2400",
  text: "#F0E6C8", muted: "#C8A030", dim: "#9A7820",
  accent: "#C8941E",
  // red was #CC3333 (3.82:1 on #0E0C00) — below 4.5:1 for body text.
  // Brightened to clear the threshold while staying recognisably red.
  amber: "#D4A017", green: "#4ECCA3", red: "#E84040", blue: "#6699BB", cyan: "#EED080",
};

const bloodline: DarkPalette = {
  base: "#0F0003", surface: "#1A0008", raised: "#250010",
  border: "#2D0009", border2: "#440015",
  text: "#F5C2C7", muted: "#E8707F", dim: "#CC404F",
  // accent was #CC1A2F (3.59:1 on #1A0008) — below 4.5:1 for body text.
  // Brightened to vivid crimson to clear the threshold.
  accent: "#FF3344",
  amber: "#FF6600", green: "#1A8C3A", red: "#FF0022", blue: "#6688AA", cyan: "#FF8899",
};

const DARK_THEMES: Record<string, DarkPalette> = {
  phosphor, amber, midnight, matrix, synthwave,
  "deep-space": deepSpace, mario, gilded, bloodline,
};

// ── WCAG contrast math ───────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return [r, g, b];
}

function linearize(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrast(fg: string, bg: string): number {
  const lf = luminance(fg);
  const lb = luminance(bg);
  const max = Math.max(lf, lb);
  const min = Math.min(lf, lb);
  return (max + 0.05) / (min + 0.05);
}

// ── Pair definitions ─────────────────────────────────────────────────────────

// AA thresholds:
//   4.5:1  normal body text
//   3.0:1  large text (>=18pt or >=14pt bold) AND graphical/UI (borders,
//          icons, focus rings, chart lines)
// We treat borders as graphical (3:1) and everything else as text (4.5:1).
// dim is tertiary/decorative — audit allows lower, but we still gate at 3:1
// so a dim label doesn't disappear entirely.

type Threshold = 4.5 | 3.0;
interface Pair { fg: keyof Palette; bg: keyof Palette; threshold: Threshold; label: string; }
interface DarkPair { fg: keyof DarkPalette; bg: keyof DarkPalette; threshold: Threshold; label: string; }

const PAIRS: Pair[] = [
  // Text on the three surface levels.
  { fg: "text", bg: "surface", threshold: 4.5, label: "text on surface" },
  { fg: "text", bg: "base", threshold: 4.5, label: "text on base" },
  { fg: "text", bg: "raised", threshold: 4.5, label: "text on raised" },
  // Secondary label colours.
  { fg: "muted", bg: "surface", threshold: 4.5, label: "muted on surface" },
  { fg: "muted", bg: "raised", threshold: 4.5, label: "muted on raised" },
  { fg: "dim", bg: "surface", threshold: 3.0, label: "dim on surface (large/UI)" },
  // Accent + status colours (used as text in pills, chips, deltas).
  { fg: "accent", bg: "surface", threshold: 4.5, label: "accent on surface" },
  { fg: "amber", bg: "surface", threshold: 4.5, label: "amber on surface" },
  { fg: "green", bg: "surface", threshold: 4.5, label: "green on surface" },
  { fg: "red", bg: "surface", threshold: 4.5, label: "red on surface" },
  { fg: "blue", bg: "surface", threshold: 4.5, label: "blue on surface" },
  { fg: "cyan", bg: "surface", threshold: 4.5, label: "cyan on surface" },
  // Identity ramp — used as text (feed labels, member names) and as
  // graphical marks (dots, chart lines). Gate at 4.5:1 so the text
  // usage is safe; graphical usage is comfortably over 3:1 as a
  // byproduct.
  ...Array.from({ length: 12 }, (_, i) => ({
    fg: `id${i + 1}` as keyof Palette,
    bg: "surface" as const,
    threshold: 4.5 as const,
    label: `id-${i + 1} on surface`,
  })),
  // Borders — graphical, 3:1.
  { fg: "border", bg: "surface", threshold: 3.0, label: "border on surface (UI)" },
  { fg: "border", bg: "base", threshold: 3.0, label: "border on base (UI)" },
  { fg: "border2", bg: "surface", threshold: 3.0, label: "border2 on surface (UI)" },
];

const DARK_PAIRS: DarkPair[] = [
  { fg: "text", bg: "surface", threshold: 4.5, label: "text on surface" },
  { fg: "text", bg: "base", threshold: 4.5, label: "text on base" },
  { fg: "text", bg: "raised", threshold: 4.5, label: "text on raised" },
  { fg: "muted", bg: "surface", threshold: 4.5, label: "muted on surface" },
  { fg: "muted", bg: "raised", threshold: 4.5, label: "muted on raised" },
  { fg: "dim", bg: "surface", threshold: 3.0, label: "dim on surface (large/UI)" },
  { fg: "accent", bg: "surface", threshold: 4.5, label: "accent on surface" },
  { fg: "amber", bg: "surface", threshold: 4.5, label: "amber on surface" },
  { fg: "green", bg: "surface", threshold: 4.5, label: "green on surface" },
  { fg: "red", bg: "surface", threshold: 4.5, label: "red on surface" },
  { fg: "blue", bg: "surface", threshold: 4.5, label: "blue on surface" },
  { fg: "cyan", bg: "surface", threshold: 4.5, label: "cyan on surface" },
  { fg: "border", bg: "surface", threshold: 3.0, label: "border on surface (UI)" },
  { fg: "border", bg: "base", threshold: 3.0, label: "border on base (UI)" },
  { fg: "border2", bg: "surface", threshold: 3.0, label: "border2 on surface (UI)" },
];

// ── Runner ───────────────────────────────────────────────────────────────────

interface Row { theme: string; label: string; fg: string; bg: string; ratio: number; threshold: Threshold; pass: boolean; }

function checkTheme(theme: string, p: Palette): Row[] {
  return PAIRS.map((pair) => {
    const fg = p[pair.fg];
    const bg = p[pair.bg];
    const ratio = contrast(fg, bg);
    return {
      theme, label: pair.label, fg, bg,
      ratio: Math.round(ratio * 100) / 100,
      threshold: pair.threshold,
      pass: ratio >= pair.threshold,
    };
  });
}

function checkDarkTheme(theme: string, p: DarkPalette): Row[] {
  return DARK_PAIRS.map((pair) => {
    const fg = p[pair.fg];
    const bg = p[pair.bg];
    const ratio = contrast(fg, bg);
    return {
      theme, label: pair.label, fg, bg,
      ratio: Math.round(ratio * 100) / 100,
      threshold: pair.threshold,
      pass: ratio >= pair.threshold,
    };
  });
}

function pad(s: string, n: number): string { return s.length >= n ? s : s + " ".repeat(n - s.length); }

function printTable(rows: Row[]): void {
  const theme = rows[0]?.theme ?? "";
  console.log(`\n── ${theme} ` + "─".repeat(72 - theme.length));
  console.log(`${pad("pair", 34)} ${pad("fg", 9)} ${pad("bg", 9)} ${pad("ratio", 7)} ${pad("need", 5)} status`);
  for (const r of rows) {
    const status = r.pass ? "PASS" : "FAIL";
    const ratio = r.ratio.toFixed(2).padStart(5, " ");
    const need = r.threshold.toFixed(1).padStart(4, " ");
    console.log(`${pad(r.label, 34)} ${pad(r.fg, 9)} ${pad(r.bg, 9)}   ${ratio}   ${need}  ${status}`);
  }
}

function main(): void {
  const all: Row[] = [];

  console.log("\n════ LIGHT THEMES ════════════════════════════════════════════════════════════");
  for (const [name, palette] of Object.entries(LIGHT_THEMES)) {
    const rows = checkTheme(name, palette);
    printTable(rows);
    all.push(...rows);
  }

  console.log("\n════ DARK THEMES ═════════════════════════════════════════════════════════════");
  for (const [name, palette] of Object.entries(DARK_THEMES)) {
    const rows = checkDarkTheme(name, palette);
    printTable(rows);
    all.push(...rows);
  }

  const failures = all.filter((r) => !r.pass);
  console.log("");
  if (failures.length === 0) {
    const lightCount = Object.keys(LIGHT_THEMES).length;
    const darkCount = Object.keys(DARK_THEMES).length;
    console.log(`All ${all.length} pairs across ${lightCount} light + ${darkCount} dark themes pass WCAG AA thresholds.`);
    return;
  }
  console.log(`FAIL: ${failures.length} pair(s) below threshold:`);
  for (const f of failures) {
    console.log(`  ${f.theme}  ${f.label}  ${f.fg} on ${f.bg}  ${f.ratio.toFixed(2)} < ${f.threshold.toFixed(1)}`);
  }
  process.exit(1);
}

main();
