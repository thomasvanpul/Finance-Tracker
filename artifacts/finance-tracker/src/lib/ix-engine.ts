// IX companion engine — state, persistence, calculations
// All functions are pure; no React imports.

// ── Types ──────────────────────────────────────────────────────────────────────
export const BOND_RANKS = [
  "stranger", "acquaintance", "companion", "trusted", "devoted", "soulbound",
] as const;
export type BondRank = (typeof BOND_RANKS)[number];

export type Mood =
  | "happy" | "excited" | "bored" | "grumpy"
  | "anxious" | "sleepy" | "curious" | "content";

export const ACCESSORIES = {
  monocle: { unlockLevel: 2, label: "Monocle" },
  hat:     { unlockLevel: 3, label: "Top Hat" },
  cape:    { unlockLevel: 4, label: "Cape" },
  jetpack: { unlockLevel: 5, label: "Jetpack" },
  crown:   { unlockLevel: 7, label: "Crown" },
} as const;
export type AccessoryId = keyof typeof ACCESSORIES;

export interface IxVitals {
  energy:    number; // 0–100 — depletes ~1pt/min
  hunger:    number; // 0–100 — depletes ~0.7pt/min
  attention: number; // 0–100 — depletes ~0.5pt/min
  happiness: number; // 0–100 — composite slow drift
}

export interface IxPersisted {
  v: 1;
  createdAt: number;
  lastSeen:  number;
  vitals:    IxVitals;
  xp:        number;
  level:     number;
  totalInteractions: number;
  chatCount:         number;
  visitCount:        number;
  petCount:          number;
  consecutiveDays:   number;
  longestStreak:     number;
  lastVisitDay:      string; // YYYY-MM-DD
  achievements:      string[];
  activeAccessory:   AccessoryId | null;
}

// ── Persistence ────────────────────────────────────────────────────────────────
const KEY = "ix-companion-v1";

export function loadIxState(): IxPersisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as IxPersisted;
      if (parsed.v === 1) return parsed;
    }
  } catch {}
  return defaultState();
}

export function saveIxState(s: IxPersisted): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

function defaultState(): IxPersisted {
  return {
    v: 1,
    createdAt: Date.now(), lastSeen: Date.now(),
    vitals: { energy: 90, hunger: 85, attention: 75, happiness: 88 },
    xp: 0, level: 1,
    totalInteractions: 0, chatCount: 0, visitCount: 1, petCount: 0,
    consecutiveDays: 1, longestStreak: 1, lastVisitDay: todayStr(),
    achievements: [], activeAccessory: null,
  };
}

// ── Date helpers ───────────────────────────────────────────────────────────────
export function todayStr()     { return new Date().toISOString().slice(0, 10); }
export function yesterdayStr() { return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10); }

// ── XP / Level ─────────────────────────────────────────────────────────────────
export const LEVEL_XP     = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000];
export const MAX_LEVEL    = 10;

export function computeLevel(xp: number): number {
  let l = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) {
    if (xp >= LEVEL_XP[i]) l = i + 1; else break;
  }
  return Math.min(l, MAX_LEVEL);
}

export function xpProgress(xp: number, level: number): { current: number; needed: number } {
  const base = LEVEL_XP[level - 1] ?? 0;
  const next = level < MAX_LEVEL ? (LEVEL_XP[level] ?? LEVEL_XP[LEVEL_XP.length - 1]) : LEVEL_XP[LEVEL_XP.length - 1];
  return { current: xp - base, needed: next - base };
}

export function getBondRank(level: number): BondRank {
  const idx = Math.min(Math.floor((level - 1) / 2), BOND_RANKS.length - 1);
  return BOND_RANKS[idx];
}

export function getUnlockedAccessories(level: number): AccessoryId[] {
  return (Object.keys(ACCESSORIES) as AccessoryId[]).filter(k => level >= ACCESSORIES[k].unlockLevel);
}

// ── XP reward constants ────────────────────────────────────────────────────────
export const XP = {
  interaction: 1,
  pet:         8,
  feed:        10,
  chat:        15,
  dailyVisit:  25,
  streakBonus: 10,
} as const;

// ── Vitals depletion ───────────────────────────────────────────────────────────
const DEPLETE_PER_SEC = {
  energy:    1    / 60,
  hunger:    0.7  / 60,
  attention: 0.5  / 60,
  happiness: 0.3  / 60,
} as const;

function clamp(v: number): number { return Math.max(0, Math.min(100, v)); }

export function applyDepletion(v: IxVitals, elapsedMs: number): IxVitals {
  const s = Math.min(elapsedMs / 1000, 7_200); // cap offline depletion at 2h
  return {
    energy:    clamp(v.energy    - DEPLETE_PER_SEC.energy    * s),
    hunger:    clamp(v.hunger    - DEPLETE_PER_SEC.hunger    * s),
    attention: clamp(v.attention - DEPLETE_PER_SEC.attention * s),
    happiness: clamp(v.happiness - DEPLETE_PER_SEC.happiness * s),
  };
}

export function petBoost(v: IxVitals): IxVitals {
  return {
    energy:    clamp(v.energy    + 5),
    hunger:    v.hunger,
    attention: clamp(v.attention + 25),
    happiness: clamp(v.happiness + 18),
  };
}

export function feedBoost(v: IxVitals): IxVitals {
  return {
    energy:    clamp(v.energy    + 20),
    hunger:    clamp(v.hunger    + 45),
    attention: clamp(v.attention + 10),
    happiness: clamp(v.happiness + 12),
  };
}

export function chatBoost(v: IxVitals): IxVitals {
  return {
    energy:    v.energy,
    hunger:    v.hunger,
    attention: clamp(v.attention + 30),
    happiness: clamp(v.happiness + 10),
  };
}

// ── Mood derivation ────────────────────────────────────────────────────────────
export function deriveMood(v: IxVitals, hour: number): Mood {
  // Critical vital states override everything else
  if (v.energy    < 15) return "sleepy";
  if (v.attention < 20) return "grumpy";
  if (v.hunger    < 20) return "anxious";

  // Late night / early morning push toward sleepy
  if ((hour >= 23 || hour < 5) && v.energy < 60) return "sleepy";

  if (v.happiness > 85 && v.energy > 70) return "excited";
  if (v.happiness > 70)                  return "happy";
  if (v.happiness > 55)                  return "content";
  if (v.energy    < 35)                  return "bored";
  if (v.happiness < 35)                  return "grumpy";
  if (v.attention < 50)                  return "curious";
  return "content";
}

// ── Achievement definitions ────────────────────────────────────────────────────
export const ACHIEVEMENTS: Record<string, { label: string; check: (s: IxPersisted) => boolean }> = {
  first_chat:   { label: "First Contact",   check: s => s.chatCount            >= 1   },
  ten_chats:    { label: "Chatterbox",      check: s => s.chatCount            >= 10  },
  first_pet:    { label: "Warmhearted",     check: s => s.petCount             >= 1   },
  devoted_pet:  { label: "Pet Whisperer",   check: s => s.petCount             >= 50  },
  week_streak:  { label: "7-Day Streak",    check: s => s.consecutiveDays      >= 7   },
  century:      { label: "Century",         check: s => s.totalInteractions    >= 100 },
  level_5:      { label: "Growing Up",      check: s => s.level                >= 5   },
  level_max:    { label: "Fully Evolved",   check: s => s.level                >= 10  },
  soulbound:    { label: "Soulbound",       check: s => getBondRank(s.level) === "soulbound" },
};

export function checkNewAchievements(s: IxPersisted): string[] {
  return Object.entries(ACHIEVEMENTS)
    .filter(([id, def]) => !s.achievements.includes(id) && def.check(s))
    .map(([id]) => id);
}

// ── Session init (call once on mount) ─────────────────────────────────────────
export function initSession(persisted: IxPersisted): IxPersisted {
  const s = { ...persisted };
  const elapsed = Date.now() - s.lastSeen;

  // Apply offline depletion
  if (elapsed > 60_000) s.vitals = applyDepletion(s.vitals, elapsed);

  // Daily streak logic
  const today = todayStr();
  if (s.lastVisitDay !== today) {
    s.consecutiveDays = s.lastVisitDay === yesterdayStr() ? s.consecutiveDays + 1 : 1;
    s.longestStreak   = Math.max(s.longestStreak, s.consecutiveDays);
    s.lastVisitDay    = today;
    s.visitCount++;
  }

  s.lastSeen = Date.now();
  return s;
}
