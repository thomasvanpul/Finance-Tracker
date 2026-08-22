import type { FintrackTheme } from "@/contexts/theme-context";

// ── Level system ──────────────────────────────────────────────────────────────

export interface Level {
  name: string;
  minXP: number;
  color: string;
}

export const LEVELS: Level[] = [
  { name: "NOVICE",   minXP: 0,   color: "var(--ft-dim)" },
  { name: "STUDENT",  minXP: 100, color: "var(--ft-green)" },
  { name: "ANALYST",  minXP: 300, color: "var(--ft-blue)" },
  { name: "SCHOLAR",  minXP: 600, color: "var(--ft-amber)" },
  { name: "MASTER",   minXP: 900, color: "var(--ft-accent)" },
];

export function getLevel(xp: number): Level & { next: Level | null; progress: number } {
  let current = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.minXP) current = lvl;
  }
  const idx = LEVELS.indexOf(current);
  const next = LEVELS[idx + 1] ?? null;
  const progress = next
    ? ((xp - current.minXP) / (next.minXP - current.minXP)) * 100
    : 100;
  return { ...current, next, progress };
}

// ── Theme rewards ─────────────────────────────────────────────────────────────

export type ThemeRarity = "COMMON" | "UNCOMMON" | "RARE" | "EPIC" | "LEGENDARY";

export interface ThemeReward {
  id: FintrackTheme;
  label: string;
  requiredXP: number;
  rarity: ThemeRarity;
  accent: string;
  base: string;
  description: string;
}

export const THEME_REWARDS: ThemeReward[] = [
  // ── Free (requiredXP: 0) ──────────────────────────────────────────────
  // Four themes ship free: void (default, implicit — not in this list),
  // phosphor (dark, CRT green), arctic (light, corporate), parchment
  // (light, warm paper). Two dark + two light — one distinctly cool and
  // one distinctly warm on each side. The paid set below carries the
  // variety rather than duplicating what's already free.
  //
  // Four free themes is the "nobody has to grind to make the app
  // usable" threshold. Everything above is decoration, and decoration
  // is what XP should buy.
  { id: "phosphor",   label: "Phosphor",   requiredXP: 0,    rarity: "COMMON",    accent: "#7FFF00", base: "#020802", description: "CRT phosphor green" },
  { id: "arctic",     label: "Arctic",     requiredXP: 0,    rarity: "COMMON",    accent: "#0052CC", base: "#F0F4F8", description: "Corporate daylight" },
  { id: "parchment",  label: "Parchment",  requiredXP: 0,    rarity: "COMMON",    accent: "#7A1F30", base: "#F5EBD8", description: "FT paper, newsprint red" },
  // ── Paid: UNCOMMON (200–500) ──────────────────────────────────────────
  // Ladder alternates light/dark so a user of either tone-preference
  // gets a reward at each early step. amber (dark warm) → slate (light
  // cool grey) → midnight (dark blue) → linen (light warm ledger).
  // slate + linen were previously free; moved here so the paid set
  // gets variety and the free set keeps only one distinctly cool and
  // one distinctly warm option per tone.
  { id: "amber",      label: "Amber",      requiredXP: 200,  rarity: "UNCOMMON",  accent: "#FFD700", base: "#0A0600", description: "Warm trader console" },
  { id: "slate",      label: "Slate",      requiredXP: 300,  rarity: "UNCOMMON",  accent: "#0E5766", base: "#DFE6EE", description: "Granite desk, deep teal" },
  { id: "midnight",   label: "Midnight",   requiredXP: 400,  rarity: "UNCOMMON",  accent: "#4D9FFF", base: "#010817", description: "Late-night deep blue" },
  { id: "linen",      label: "Linen",      requiredXP: 500,  rarity: "UNCOMMON",  accent: "#5A4610", base: "#EEE7D6", description: "Warm ledger, olive gold" },
  // ── Paid: RARE / EPIC / LEGENDARY (650+) ──────────────────────────────
  { id: "matrix",     label: "Matrix",     requiredXP: 650,  rarity: "RARE",      accent: "#00FF41", base: "#000300", description: "Decoded reality" },
  { id: "synthwave",  label: "Synthwave",  requiredXP: 750,  rarity: "RARE",      accent: "#FF007A", base: "#0D001A", description: "Neon grids, 80s midnight" },
  { id: "deep-space", label: "Deep Space", requiredXP: 800,  rarity: "RARE",      accent: "#7B5EA7", base: "#010108", description: "Cosmic observatory" },
  { id: "mario",      label: "Mario",      requiredXP: 950,  rarity: "EPIC",      accent: "#E31212", base: "#0A0F1F", description: "8-bit power-up" },
  { id: "gilded",     label: "Gilded",     requiredXP: 1100, rarity: "EPIC",      accent: "#C8941E", base: "#080600", description: "Black gold, no noise" },
  { id: "bloodline",  label: "Bloodline",  requiredXP: 1300, rarity: "LEGENDARY", accent: "#CC1A2F", base: "#0F0003", description: "Dark market, red signals" },
];

// Load-bearing helper for the settings picker enforcement gate. Both
// desktop and mobile theme swatches previously wired `onClick={() =>
// setTheme(id)}` with no lock check — the "Requires 300 XP" label was
// decoration and a locked swatch still applied on click. This helper
// centralises the rule so both pickers gate against the same predicate,
// and so the invariant is grep-able ("isThemeUnlocked" appears only
// where a theme choice should be gated).
export function isThemeUnlocked(id: FintrackTheme, learnXP: number): boolean {
  // void is the implicit default — not in THEME_REWARDS but always usable.
  if (id === "void") return true;
  const reward = THEME_REWARDS.find((r) => r.id === id);
  // Unknown ids default to unlocked so a bad state doesn't lock the
  // user out of a theme they legitimately have. Widening the type union
  // without an accompanying THEME_REWARDS entry should surface via
  // TypeScript rather than a silent lockout here.
  if (!reward) return true;
  return learnXP >= reward.requiredXP;
}

export const RARITY_COLOR: Record<ThemeRarity, string> = {
  COMMON:    "var(--ft-dim)",
  UNCOMMON:  "var(--ft-green)",
  RARE:      "var(--ft-blue)",
  EPIC:      "#a855f7",
  LEGENDARY: "var(--ft-amber)",
};

// ── XP accounting ─────────────────────────────────────────────────────────────

// Mirrors the xp field from each TopicCard in learn-tab.tsx.
// Update here whenever a topic's XP value changes there.
const TOPIC_XP: Record<string, number> = {
  "compound-interest":    60,
  "diversification":      50,
  "dca":                  50,
  "four-percent-rule":    60,
  "pe-ratio":             75,
  "dcf-valuation":        100,
  "options-101":          120,
  "short-selling":        120,
  "emergency-fund":       45,
  "fifty-thirty-twenty":  45,
  "zero-based-budgeting": 65,
  "debt-avalanche":       55,
  "index-funds":          60,
  "bonds-basics":         55,
  "reits":                75,
  "factor-investing":     100,
  "isa-strategy":         60,
  "pension-basics":       55,
  "capital-gains-tax":    75,
  "tax-loss-harvesting":  90,
  "credit-scores":        50,
  "mortgage-basics":      70,
  "insurance-basics":     50,
  "inflation":            55,
  "interest-rates":       70,
  "yield-curve":          85,
  "gdp-basics":           50,
  "bitcoin-basics":       60,
  "blockchain-basics":    55,
  "defi-basics":          80,
  "stablecoins":          70,
};

const PROGRESS_KEY = "nr-learn-progress";

export function getLearnXP(): number {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    const ids: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    return ids.reduce((sum, id) => sum + (TOPIC_XP[id] ?? 0), 0);
  } catch { return 0; }
}

// F5 maintenance-XP amounts. Named constants so a grep for XP_
// finds every earning event, and so no rule of the form
// "if user did X, +N XP" hides inside a component.
export const XP_PER_CAT_RULE = 25;
export const XP_PER_COMPLETED_GOAL = 50;
export const XP_PER_SYNCED_PROVIDER = 100;

// XP earned from auto-categorisation rules the user has set. Reads
// the same localStorage key auto-cat.ts writes to. One-time per
// rule id — deleting a rule removes its XP (fine: XP is derived
// from state, not a cumulative counter, so gaming by add/delete
// nets zero).
const CAT_RULES_KEY = "nr-cat-rules";
export function getCatRulesXP(): number {
  try {
    const raw = localStorage.getItem(CAT_RULES_KEY);
    const rules = raw ? (JSON.parse(raw) as unknown[]) : [];
    return rules.length * XP_PER_CAT_RULE;
  } catch { return 0; }
}

// Sum of all locally-derivable XP (learn topics + cat rules). API-
// derived XP (goals reached, providers synced) is added by
// useTotalXP() in hooks/use-total-xp.ts so this pure module has
// no react-query dependency.
export function getMaintenanceLocalXP(): number {
  return getLearnXP() + getCatRulesXP();
}
