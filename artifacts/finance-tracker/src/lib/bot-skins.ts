import type { FintrackTheme } from "@/contexts/theme-context";

export type BotSkinId = "ix" | "mario" | "gilded" | "bloodline";

const SKIN_KEY = "numeris-bot-skin";
const VALID_IDS: BotSkinId[] = ["ix", "mario", "gilded", "bloodline"];

export function getBotSkin(): BotSkinId {
  try {
    const stored = localStorage.getItem(SKIN_KEY) as BotSkinId;
    return VALID_IDS.includes(stored) ? stored : "ix";
  } catch { return "ix"; }
}

export function setBotSkin(id: BotSkinId) {
  try { localStorage.setItem(SKIN_KEY, id); } catch {}
}

export type SkinRarity = "COMMON" | "EPIC" | "LEGENDARY";

export interface SkinDef {
  id: BotSkinId;
  label: string;
  desc: string;
  rarity: SkinRarity;
  perks: string[];
  requiredTheme: FintrackTheme | null;
}

export const SKINS: SkinDef[] = [
  {
    id: "ix",
    label: "IX Bot",
    desc: "The default Numeris AI mascot. Always available.",
    rarity: "COMMON",
    perks: ["Cyan visor", "Dual antennas", "Always unlocked"],
    requiredTheme: null,
  },
  {
    id: "mario",
    label: "Super Mario",
    desc: "It's-a me! Roaming your portfolio. Comes with warp pipes, coins, mushrooms & more.",
    rarity: "EPIC",
    perks: ["Warp pipe hangout", "Coin shower on jump", "? block thinking", "Red cap + mustache"],
    requiredTheme: "mario",
  },
  {
    id: "gilded",
    label: "Gilded",
    desc: "Forged from pure ambition. A gold-crowned robot dripping wealth.",
    rarity: "EPIC",
    perks: ["Royal crown + gems", "Amber reactor core", "Coin shower dance", "Golden chalice coffee"],
    requiredTheme: "gilded",
  },
  {
    id: "bloodline",
    label: "Bloodline",
    desc: "Ancient crimson machine. Fractured armor. Eyes like embers. Bats follow.",
    rarity: "LEGENDARY",
    perks: ["Demon horns", "Cracked armor panels", "Bat companions", "Skull thought bubble", "Crimson reactor"],
    requiredTheme: "bloodline",
  },
];
