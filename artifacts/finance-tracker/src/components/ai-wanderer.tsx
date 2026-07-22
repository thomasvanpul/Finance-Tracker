import { useState, useEffect, useRef, useCallback } from "react";
import {
  type Mood, type IxVitals, type IxPersisted, type AccessoryId,
  loadIxState, saveIxState, initSession, applyDepletion,
  petBoost, chatBoost,
  computeLevel, xpProgress, getBondRank, getUnlockedAccessories, checkNewAchievements,
  deriveMood, todayStr, yesterdayStr,
  ACHIEVEMENTS, XP, BOND_RANKS,
} from "@/lib/ix-engine";
import { getBotSkin, type BotSkinId } from "@/lib/bot-skins";
import { MarioSprite } from "./mario-skin";
import { GildedSprite, BloodlineSprite } from "./premium-skins";

interface Props { onOpen: () => void; summoned: boolean; locationKey?: string; sidebarW?: number; portfolioSignal?: "up" | "down" | null; }

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function getDefaultY() { return Math.max(window.innerHeight - 24, 120); }
function safeXRange(sw = 212) {
  return { xMin: sw + 40, xMax: Math.max(window.innerWidth - 60, sw + 200) };
}
function randomTarget(sw = 212) {
  const { xMin, xMax } = safeXRange(sw);
  if (Math.random() < 0.55) {
    const mid = (xMin + xMax) / 2;
    const half = (xMax - xMin) * 0.28;
    return rand(mid - half, mid + half);
  }
  return rand(xMin, xMax);
}

type EntryType = "crawl" | "kick" | "fly" | "roll" | "peek" | "pipe" | "shimmer" | "shadow";
const ENTRY_POOL: EntryType[] = ["crawl", "crawl", "peek", "peek", "kick", "fly", "roll"];
const ENTRY_DUR: Record<EntryType, number> = { crawl: 800, kick: 780, fly: 880, roll: 980, peek: 1500, pipe: 1800, shimmer: 1400, shadow: 2000 };
const ENTRY_ANIM: Record<EntryType, string> = {
  crawl: "ix-entry-crawl", kick: "ix-entry-kick", fly: "ix-entry-fly", roll: "ix-entry-roll", peek: "ix-entry-peek",
  pipe: "ix-entry-pipe", shimmer: "ix-entry-shimmer", shadow: "ix-entry-shadow",
};

type Phase = "idle" | "walking" | "jumping" | "sitting" | "coffee" | "tired" | "thinking" | "lying" | "complaining" | "dancing";
type IdlePhase = Exclude<Phase, "walking" | "jumping">;

const SPRITE_FLOOR_H: Record<Phase, number> = {
  idle: 66, walking: 66, jumping: 66, sitting: 66, coffee: 66,
  tired: 66, thinking: 66, lying: 51, complaining: 66, dancing: 66,
};
const SPRITE_W: Record<Phase, number> = {
  idle: 36, walking: 36, jumping: 36, sitting: 36, coffee: 36,
  tired: 36, thinking: 36, lying: 36, complaining: 36, dancing: 36,
};

// ── Mood-driven phase pools ────────────────────────────────────────────────────
const MOOD_PHASE_POOL: Record<Mood, IdlePhase[]> = {
  excited:  ["idle", "idle", "dancing", "dancing", "dancing"],
  happy:    ["idle", "idle", "idle", "sitting", "coffee", "dancing", "thinking"],
  content:  ["idle", "idle", "idle", "sitting", "sitting", "coffee", "thinking"],
  curious:  ["thinking", "thinking", "thinking", "idle", "sitting"],
  bored:    ["sitting", "sitting", "sitting", "lying", "lying", "tired", "idle"],
  sleepy:   ["tired", "tired", "tired", "lying", "lying", "sitting"],
  grumpy:   ["complaining", "complaining", "complaining", "tired", "idle"],
  anxious:  ["thinking", "thinking", "complaining", "coffee", "coffee", "idle"],
};

// Visual mood aura (drop-shadow glow)
const MOOD_GLOW: Record<Mood, string> = {
  happy:   "drop-shadow(0 0 10px rgba(16,185,129,0.55))",
  excited: "drop-shadow(0 0 14px rgba(251,191,36,0.65))",
  content: "drop-shadow(0 0 8px rgba(6,182,212,0.35))",
  curious: "drop-shadow(0 0 12px rgba(168,85,247,0.5))",
  bored:   "drop-shadow(0 0 6px rgba(100,116,139,0.45))",
  sleepy:  "drop-shadow(0 0 8px rgba(71,85,105,0.5))",
  grumpy:  "drop-shadow(0 0 12px rgba(239,68,68,0.5))",
  anxious: "drop-shadow(0 0 10px rgba(245,158,11,0.5))",
};
const MOOD_BADGE_BG: Record<Mood, string> = {
  happy: "#10b981", excited: "#fbbf24", content: "#06b6d4", curious: "#a855f7",
  bored: "#64748b", sleepy: "#475569", grumpy: "#ef4444", anxious: "#f59e0b",
};

// ── Speech ────────────────────────────────────────────────────────────────────
const SPEECH: Record<Phase | "default" | "mood_grumpy" | "mood_sleepy" | "mood_excited" | "mood_bored" | "mood_anxious" | "pet" | "drag" | "land" | "idle_random", string[]> = {
  idle:        ["Watching the charts", "Any alpha for me?", "Waiting for a breakout…", "Just vibing with the market", "Running some numbers…", "No moves yet. Patience."],
  walking:     ["On patrol", "Going to check the portfolio", "Markets never sleep, neither do I", "Scanning the perimeter", "Just doing my rounds", "Gotta stay mobile"],
  jumping:     ["BOUNCE", "Volatility is my cardio", "Wheeeee!", "To the moon!!", "Air time!!"],
  sitting:     ["Floor support: confirmed", "Sitting out this dip", "This is the life", "Zero volatility. Love it.", "Taking a breather", "Consolidating"],
  coffee:      ["Don't @ me before coffee", "Bean to bull run", "Espresso shot loading…", "Dark roast. Dark markets.", "Fuel acquired."],
  tired:       ["Running on 3% battery", "I need a nap AND a rate cut", "Bearish on my own energy", "Lowkey need a kernel restart", "Low power mode activated"],
  thinking:    ["Calculating… not googling this", "The math is mathing", "Hmm. Big if true.", "Risk/reward in progress…", "Hold on, thinking…", "Cross-referencing data…"],
  lying:       ["P&L and I are both flat", "Gravity wins today", "Horizontal diversification", "Resting compute cores", "This is fine.", "Floor go brrr"],
  complaining: ["WHY is everything RED", "These spreads are CRIMINAL!", "I did NOT sign up for this", "Someone explain this chart", "Not my fault. Definitely not.", "UNACCEPTABLE conditions"],
  dancing:     ["WE ARE SO BACK", "Green candles only", "To the moon!!", "Best day ever. Fight me.", "LETS GOOOOO", "Feeling bullish on EVERYTHING"],
  default:     ["Need some financial insights?", "Click to open the AI chat →", "What's your portfolio looking like?", "I've got ideas. You've got a portfolio."],
  mood_grumpy:  ["Stop bothering me…", "Ugh, WHAT.", "Not now.", "...", "I said what I said."],
  mood_sleepy:  ["zzzz…", "so...tired...", "five more minutes", "cannot compute", "shutting down…"],
  mood_excited: ["LETS GO!!", "This is AMAZING", "BIG MOVES energy", "Absolutely vibing rn", "MAXIMUM HYPE"],
  mood_bored:   ["nothing happening", "hello?", "anyone there?", "I'm so bored I could compute PI", "waiting…", "still waiting…"],
  mood_anxious: ["something feels off…", "running diagnostics…", "is that bad?", "monitoring closely…", "elevated volatility detected"],
  pet:          ["hehe~", "that feels nice", "don't stop", "purrrr (robot noises)", "vibes: maximum", "nice one", "acknowledged :)"],
  drag:         ["WAAAH", "put me DOWN!!", "wheeeee~", "not the physics!!", "UNHAND ME", "THIS IS FINE", "ohhh nooo"],
  land:         ["oof.", "rough landing…", "I'm ok...", "5/10 experience", "gravity and I have beef", "that was NOT planned", "10/10 would not repeat"],
  idle_random:  [
    "Have you checked your allocation lately?", "Markets close but the anxiety doesn't",
    "I've been thinking about diversification", "Interesting times we're in",
    "Your portfolio is in good hands. Probably.", "Just ran a risk assessment. You're fine.",
    "Charts don't lie. Mostly.", "Bull or bear, I'm always bullish on snacks.",
    "Have you considered rebalancing?", "Idle processor cycles = existential thoughts",
    "What if… no. Never mind.", "I computed something but forgot what.",
    "Been a while since you checked in", "Something's happening in the market. Or not.",
  ],
};

function pickSpeech(key: keyof typeof SPEECH) {
  const lines = SPEECH[key];
  return lines[Math.floor(Math.random() * lines.length)];
}

type SpeechKey = keyof typeof SPEECH;
const SKIN_SPEECH: Partial<Record<BotSkinId, Partial<Record<SpeechKey, string[]>>>> = {
  mario: {
    idle:        ["It's-a me, watching the charts!", "Wahoo! Up only!", "Mama mia, these candlesticks…", "Time to find some coins", "Let's-a go to the moon!"],
    walking:     ["Wahoo, here I go!", "Going to check the pipe— portfolio", "Coins! Coins! Coins!", "Let's-a move!", "Gotta go fast!"],
    jumping:     ["WAHOOOO!", "MAMA MIA!", "Super jump!", "Like bouncing on a Goomba!", "Yippee!!"],
    sitting:     ["Taking-a the break", "No rush, no rush", "This-a spot is nice", "Resting between levels", "Floor support: wahoo"],
    coffee:      ["Power-up acquired!", "This-a coffee is my 1-UP", "Energized like a Super Star!", "Fuel for the market run!"],
    tired:       ["Need-a more coins for energy…", "Running on last life", "Low on mushrooms", "Battery at 1HP…", "Game over? Not yet…"],
    thinking:    ["Hmm, left pipe or right pipe?", "Calculating the warp zone…", "Princess says to check the charts", "Is this-a the right level?"],
    lying:       ["Fell off the platform…", "Taking-a the horizontal rest", "Even Mario needs a break", "Game paused", "Mama mia, the floor…"],
    complaining: ["MAMA MIA! These charts!", "Someone stole my coins!", "WHY IS EVERYTHING RED?!", "NOOO! My mushroom kingdom!", "This is-a no good!"],
    dancing:     ["WAHOO! WE ARE SO BACK!", "LETS-A GO!", "Green candles like coins!", "1-UP! BIG MOVES!", "YIPPEE, TO THE MOON!"],
    pet:         ["Wahoo~!", "Mamma mia!", "Thank-a you!", "Yahoo!", "Yippee~"],
    drag:        ["WAAAH!", "Mamma mia!!", "I'm-a flying!!", "Not the Mushroom Kingdom!!", "WAHOOOO!!"],
    land:        ["Ooh! Ground pound!", "Mama mia, that was high", "Lost a life… just kidding", "Saved by the flagpole!", "That counts as a jump"],
    idle_random: ["Have-a you checked your coins?", "Markets go up like-a the castle!", "Interesting world we're in", "Wahoo! Just ran a power-up check.", "Charts-a don't lie. Mostly.", "Bull or bear, I prefer mushrooms.", "Have you considered-a the rebalancing?"],
    mood_excited: ["WAHOOOO LET'S-A GO!!", "SUPER MARIO MODE ACTIVATED", "BIG COINS ENERGY", "Absolutely vibing in the castle", "MAXIMUM WAHOO"],
    mood_grumpy:  ["Mama mia, go away…", "Not now, I'm a-frustrated", "I said what-a I said.", "Grumpy toad energy today"],
    mood_bored:   ["hello-a? anyone?", "I could-a compute PI", "waiting for the next level…", "still-a waiting…"],
    mood_anxious: ["Something feels-a off…", "Running pipe diagnostics…", "Is-a that bad?", "Monitoring closely… mama mia"],
    mood_sleepy:  ["zzzz… wahoo…", "so...tired...", "five more 1-UPs", "cannot-a compute", "shutting down… wahoo"],
  },
  gilded: {
    idle:        ["Gold never sleeps", "Watching my assets appreciate", "The market bends to gold", "Every dip is a buying opportunity", "Accumulating in silence"],
    walking:     ["Surveying my domain", "Gold moves deliberately", "Markets await my presence", "Purposeful strides", "The golem patrols"],
    jumping:     ["THE GOLEM ASCENDS", "GOLD GOES UP. AS ALWAYS.", "Even gravity cannot stop gold", "To new all-time highs!", "LIQUID GOLD, LITERALLY"],
    sitting:     ["The golem rests. Markets still watch.", "Patience is profitable", "Gold does not rush", "Sitting on my holdings", "Consolidating strength"],
    coffee:      ["Liquid gold in liquid form", "Even kings need coffee", "Pouring gold into the bloodstream", "My 50th cup today", "The golem refuels"],
    tired:       ["Even gold gets heavy…", "Carrying this crown is work", "The golem requires maintenance", "Low energy. High net worth.", "Market hours take their toll"],
    thinking:    ["Calculating total wealth…", "Running a DCF on my crown", "The fundamentals are sound", "Portfolio optimization in progress", "Wealth management subroutine active"],
    lying:       ["The golem rests horizontally", "Even gold lies flat sometimes", "Rest is an investment", "The market will wait for me", "Horizontal accumulation"],
    complaining: ["THIS IS NOT ACCEPTABLE", "Do they not understand VALUE?!", "The market is BROKEN today", "I am worth MORE than this", "WHO IS SELLING RIGHT NOW?!"],
    dancing:     ["TO THE GOLD MOON!", "WEALTH IS LOADING…", "KING MIDAS ENERGY!", "Everything I touch turns green", "GILDED GAINS ONLY"],
    pet:         ["You may touch the golem", "…Acceptable.", "The gold approves", "Aah. Warmth.", "You have earned a coin"],
    drag:        ["Unhand me, peasant!", "Do you KNOW what I'm worth?!", "This is UNDIGNIFIED", "Put me down this INSTANT", "I am NOT cargo!"],
    land:        ["The golem lands with authority", "Gold always lands on its feet", "…I meant to do that", "Controlled descent. As expected.", "Gravity: still not my equal"],
    idle_random: ["Markets close but gold endures", "I have been thinking about diversification", "Your portfolio is under my protection", "Just ran a risk assessment. You're fine, mostly.", "Charts don't lie. My crown does not either.", "Bull or bear, gold wins.", "Have you considered rebalancing?", "Idle cycles = wealth planning"],
    mood_excited: ["MAXIMUM WEALTH INCOMING", "THIS IS AMAZING FOR GOLD", "BIG MOVES AND BIGGER CROWN", "Absolutely stacking rn", "UNLIMITED POWER (and assets)"],
    mood_grumpy:  ["Leave me alone…", "Ugh. WHAT do you want.", "Not now.", "I said what I said. In gold."],
    mood_bored:   ["…hello?", "anyone watching the charts?", "Calculating PI. It's irrational, like this market.", "waiting for volatility…", "still waiting… gold is patient"],
    mood_anxious: ["Something feels off… but gold is fine", "Running audits…", "Is that bad for my holdings?", "Monitoring the crown… it glows", "Elevated volatility. I am unimpressed."],
    mood_sleepy:  ["zzzz (heavy crown)…", "so...wealthy...so...tired", "five more gold bars", "cannot compute… appreciating", "shutting down… assets safe"],
  },
  bloodline: {
    idle:        ["The market bleeds", "Red flows. I feed.", "Patience… the dip comes", "I have watched empires fall", "The charts know my name"],
    walking:     ["I drift through these markets", "The darkness moves with purpose", "Stalking the next candle", "They cannot escape the red", "Gliding… always gliding"],
    jumping:     ["THE DEVIL RISES", "CHAOS ASCENDING", "Wings unfurl!", "I fly because I CHOOSE to", "THE DARKNESS LIFTS"],
    sitting:     ["The demon observes", "Patience is a predator's virtue", "I wait. And wait. Then sell.", "Conserving dark energy", "Even demons need to sit"],
    coffee:      ["Liquid fire. Good.", "This warms my cold reactor", "Blood of the bean. Perfect.", "Finally, something hot enough.", "I drink the darkness. And coffee."],
    tired:       ["Even darkness wearies…", "The wings grow heavy", "Too much red. Even for me.", "Low on dark energy…", "Brief recharge. Fear not."],
    thinking:    ["Calculating the destruction…", "Plotting the fall of bulls", "Summoning market volatility…", "Reading the omens…", "The dark oracle processes"],
    lying:       ["The demon rests. For now.", "Do not mistake rest for weakness", "Even I sleep. Briefly.", "Charging for the next red candle", "The darkness pools here"],
    complaining: ["AS EXPECTED. EVERYTHING IS RED.", "GOOD. MORE CHAOS.", "The suffering feeds me", "I predicted this.", "The bears answer to me"],
    dancing:     ["THE BLOOD MOON RISES!", "RED CANDLES EVERYWHERE, AS IT SHOULD BE!", "CHAOS. BEAUTIFUL CHAOS.", "I FEED ON VOLATILITY!", "THE MARKET BOWS TO ME"],
    pet:         ["Do not mistake this for weakness", "…hmm.", "Your soul is safe. For now.", "*demonic purring*", "The darkness… appreciates you"],
    drag:        ["YOU DARE?!", "RELEASE ME!!", "I WILL REMEMBER THIS", "The darkness does not like this", "I AM ETERNAL AND YOU ARE THROWING ME"],
    land:        ["The demon lands with purpose", "Controlled fall. Intentional.", "I descended by CHOICE", "The darkness returns to earth", "…that was planned"],
    idle_random: ["I have been watching you", "Your portfolio… concerns me", "I sense a red candle approaching", "The market has awakened the beast", "Have you made your offering?", "I see fear in the charts", "The volatility speaks to me", "Do not fight the trend. It is mine.", "Dark patterns forming in the data"],
    mood_excited: ["THE CHAOS RISES!!", "THIS IS WHAT I LIVE FOR", "MAXIMUM VOLATILITY!", "The darkness is absolutely vibing", "UNLIMITED DARKNESS POWER"],
    mood_grumpy:  ["…leave.", "Begone.", "The darkness is displeased", "I said what I said."],
    mood_bored:   ["…", "is anything happening", "wake me when it crashes", "waiting for chaos…", "still waiting for the apocalypse…"],
    mood_anxious: ["Something is coming…", "I can feel the volatility…", "The omens are unclear…", "Dark patterns converging…", "Something feels off. Good."],
    mood_sleepy:  ["zzzz (demonic snoring)…", "even darkness...sleeps", "five more eons", "cannot compute…", "wings folded… resting"],
  },
};

function skinPickSpeech(key: SpeechKey, skinId: BotSkinId): string {
  const skinLines = SKIN_SPEECH[skinId]?.[key];
  if (skinLines && skinLines.length > 0) {
    return skinLines[Math.floor(Math.random() * skinLines.length)];
  }
  return pickSpeech(key);
}

// ── Palette ───────────────────────────────────────────────────────────────────
const H  = "#0c1628"; const HS = "#7c3aed"; const VS = "#06b6d4";
const VF = "#040c18"; const BD = "#162032"; const BS = "#2a3f60";
const JT = "#344d75"; const LG = "#1a2d4a"; const LB = "#253b58";
const BT = "#0f1e35"; const BB = "#1e3050"; const SN = "#f472b6";

// ── Shared head sub-components ────────────────────────────────────────────────
function FrontEyes({ phase, blinking }: { phase: Phase; blinking: boolean }) {
  if (blinking) return (<><rect x="9" y="18" width="6" height="1.4" rx="0.7" fill={VS}/><rect x="19" y="18" width="6" height="1.4" rx="0.7" fill={VS}/></>);
  if (phase === "lying") return (<><path d="M9 19.5 Q12 17.5 15 19.5" stroke="#475569" strokeWidth="1.5" fill="none" strokeLinecap="round"/><path d="M19 19.5 Q22 17.5 25 19.5" stroke="#475569" strokeWidth="1.5" fill="none" strokeLinecap="round"/></>);
  if (phase === "tired") return (<><rect x="9" y="16.5" width="6" height="5" rx="3" fill={VF}/><rect x="9" y="19" width="6" height="3" rx="1.5" fill="#fbbf24" opacity="0.8"/><rect x="19" y="16.5" width="6" height="5" rx="3" fill={VF}/><rect x="19" y="19" width="6" height="3" rx="1.5" fill="#fbbf24" opacity="0.8"/></>);
  if (phase === "coffee" || phase === "dancing") return (<><path d="M9 20.5 Q12 17 15 20.5" stroke={VS} strokeWidth="1.4" fill="none" strokeLinecap="round"/><path d="M19 20.5 Q22 17 25 20.5" stroke={VS} strokeWidth="1.4" fill="none" strokeLinecap="round"/></>);
  if (phase === "thinking") return (<><ellipse cx="12" cy="19" rx="3" ry="2.5" fill={VS} opacity="0.9"/><circle cx="13.2" cy="17.8" r="1" fill="rgba(255,255,255,0.55)"/><ellipse cx="22" cy="18" rx="3" ry="2.5" fill={VS} opacity="0.9"/><circle cx="23.5" cy="16.8" r="1" fill="rgba(255,255,255,0.55)"/></>);
  if (phase === "complaining") return (<><ellipse cx="12" cy="19.5" rx="3" ry="2.5" fill="#ef4444"/><line x1="9" y1="16.5" x2="15" y2="19" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/><ellipse cx="22" cy="19.5" rx="3" ry="2.5" fill="#ef4444"/><line x1="19" y1="16.5" x2="25" y2="19" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/></>);
  return (<><ellipse cx="12" cy="19" rx="3" ry="2.5" fill={VS} opacity="0.9"/><circle cx="13" cy="17.9" r="1" fill="rgba(255,255,255,0.55)"/><ellipse cx="22" cy="19" rx="3" ry="2.5" fill={VS} opacity="0.9"/><circle cx="23" cy="17.9" r="1" fill="rgba(255,255,255,0.55)"/></>);
}
function FrontMouth({ phase }: { phase: Phase }) {
  if (phase === "tired") return <ellipse cx="17" cy="25" rx="3" ry="1.8" fill={HS} opacity="0.7"/>;
  if (phase === "complaining") return <path d="M12 26 Q17 23.5 22 26" stroke="#ef4444" strokeWidth="1.2" fill="none" strokeLinecap="round"/>;
  if (phase === "coffee" || phase === "sitting" || phase === "dancing") return <path d="M12 25.5 Q17 28.5 22 25.5" stroke={VS} strokeWidth="1.2" fill="none" strokeLinecap="round"/>;
  if (phase === "thinking") return <rect x="13" y="25" width="8" height="1.5" rx="0.75" fill={VS} opacity="0.5"/>;
  return <path d="M13 25.5 Q17 27 21 25.5" stroke={VS} strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5"/>;
}
function FrontHead({ phase, blinking, hStroke }: { phase: Phase; blinking: boolean; hStroke: string }) {
  return (<>
    {/* Dual antennas */}
    <circle cx="14" cy="1.5" r="1.4" fill={SN}/>
    <rect x="13.2" y="2.8" width="1.6" height="5" rx="0.8" fill={SN}/>
    <line x1="14" y1="7.8" x2="15.3" y2="9.5" stroke={SN} strokeWidth="0.9" opacity="0.6"/>
    <circle cx="20" cy="1.5" r="1.4" fill={SN}/>
    <rect x="19.2" y="2.8" width="1.6" height="5" rx="0.8" fill={SN}/>
    <line x1="20" y1="7.8" x2="18.7" y2="9.5" stroke={SN} strokeWidth="0.9" opacity="0.6"/>
    {/* Helmet dome */}
    <ellipse cx="17" cy="17" rx="13" ry="13" fill={H} stroke={hStroke} strokeWidth="1.5"/>
    <ellipse cx="17" cy="17" rx="10" ry="10" fill="none" stroke="#1a2a40" strokeWidth="2.5"/>
    {/* Dome shine */}
    <ellipse cx="11.5" cy="10" rx="4" ry="2.5" fill="rgba(255,255,255,0.04)"/>
    {/* Visor */}
    <rect x="7" y="13" width="20" height="10" rx="2" fill={VF}/>
    <rect x="7" y="13" width="20" height="10" rx="2" fill="none" stroke={hStroke === HS ? VS : hStroke} strokeWidth="0.8" opacity="0.75"/>
    {/* Visor glass glare */}
    <rect x="8.5" y="13.5" width="9" height="1.2" rx="0.6" fill="rgba(255,255,255,0.08)"/>
    <FrontEyes phase={phase} blinking={blinking}/>
    <FrontMouth phase={phase}/>
    <rect x="13" y="28" width="8" height="3" rx="1.5" fill="#0e1c30" stroke={BS} strokeWidth="0.7"/>
  </>);
}

// ── Sparkle particles for petting ─────────────────────────────────────────────
const SPARKLE_POS = [
  { x: -18, y: -12 }, { x: 14, y: -18 }, { x: 22, y: 4 }, { x: -8, y: -24 },
  { x: 18, y: -8 }, { x: -22, y: 0 }, { x: 6, y: -28 }, { x: -4, y: 10 },
];
function Sparkles({ w }: { w: number }) {
  return (
    <>
      {SPARKLE_POS.map((p, i) => (
        <div key={i} style={{
          position: "absolute",
          left: w / 2 + p.x, top: 20 + p.y,
          width: 5, height: 5,
          borderRadius: "50%",
          background: i % 3 === 0 ? VS : i % 3 === 1 ? "#fbbf24" : SN,
          animation: `ix-sparkle 0.7s ease-out ${i * 0.06}s forwards`,
          pointerEvents: "none",
        }}/>
      ))}
    </>
  );
}

// ── Public preview export (used by wardrobe page) ─────────────────────────────
export { type Phase };
export function BotPreview({ skinId, phase = "idle", blinking = false, walking = false }: { skinId: BotSkinId; phase?: Phase; blinking?: boolean; walking?: boolean }) {
  return <BotSprite phase={phase} blinking={blinking} walking={walking} skinId={skinId} />;
}

// ── BotSprite ──────────────────────────────────────────────────────────────────
function BotSprite({ phase, blinking, walking, skinId }: { phase: Phase; blinking: boolean; walking: boolean; skinId: BotSkinId }) {
  if (skinId === "mario")     return <MarioSprite     phase={phase} blinking={blinking} walking={walking} />;
  if (skinId === "gilded")    return <GildedSprite    phase={phase} blinking={blinking} walking={walking} />;
  if (skinId === "bloodline") return <BloodlineSprite phase={phase} blinking={blinking} walking={walking} />;


  // Per-phase helmet stroke color
  const hStroke = phase === "tired" ? "#64748b" : phase === "complaining" ? "#ef4444" : HS;

  // Per-phase arm styles (pivot: left = 5px 38px, right = 31px 38px)
  const lArmStyle: React.CSSProperties =
    phase === "lying"      ? { transform: "rotate(88deg)" } :
    phase === "sitting"    ? { transform: "rotate(28deg)" } :
    phase === "tired"      ? { transform: "rotate(22deg)" } :
    phase === "thinking"   ? { transform: "rotate(-38deg)" } :
    phase === "jumping"    ? { animation: "ix-arm-jump-l 0.75s cubic-bezier(0.36,0.07,0.19,0.97) forwards" } :
    walking                ? { animation: "ix-arm-walk 0.42s ease-in-out infinite" } :
    phase === "complaining"? { animation: "ix-arm-complain-l 0.35s ease-in-out infinite" } :
    phase === "dancing"    ? { animation: "ix-arm-dance-l 0.52s ease-in-out infinite" } :
                             { animation: "ix-arm-idle-l 3.2s ease-in-out infinite" };

  const rArmStyle: React.CSSProperties =
    phase === "lying"      ? { transform: "rotate(-32deg)" } :
    phase === "sitting"    ? { transform: "rotate(-28deg)" } :
    phase === "coffee"     ? { transform: "rotate(-55deg)" } :
    phase === "tired"      ? { transform: "rotate(-22deg)" } :
    phase === "thinking"   ? { transform: "rotate(18deg)" } :
    phase === "jumping"    ? { animation: "ix-arm-jump-r 0.75s cubic-bezier(0.36,0.07,0.19,0.97) forwards" } :
    walking                ? { animation: "ix-arm-walk-far 0.42s ease-in-out infinite" } :
    phase === "complaining"? { animation: "ix-arm-complain-r 0.35s ease-in-out infinite" } :
    phase === "dancing"    ? { animation: "ix-arm-dance-r 0.52s ease-in-out infinite" } :
                             { animation: "ix-arm-idle-r 3.5s ease-in-out infinite" };

  // Per-phase leg styles
  const lLegStyle: React.CSSProperties =
    phase === "lying"   ? { transform: "rotate(-20deg)", transformBox: "fill-box", transformOrigin: "50% 0%" } :
    phase === "sitting" ? { transform: "rotate(-50deg)", transformBox: "fill-box", transformOrigin: "50% 0%" } :
    phase === "dancing" ? { animation: "ix-walk-leg-l 0.5s ease-in-out infinite" } :
    walking             ? { animation: "ix-walk-leg-l 0.42s ease-in-out infinite" } : {};

  const rLegStyle: React.CSSProperties =
    phase === "lying"   ? { transform: "rotate(20deg)", transformBox: "fill-box", transformOrigin: "50% 0%" } :
    phase === "sitting" ? { transform: "rotate(50deg)", transformBox: "fill-box", transformOrigin: "50% 0%" } :
    phase === "dancing" ? { animation: "ix-walk-leg-r 0.5s ease-in-out infinite" } :
    walking             ? { animation: "ix-walk-leg-r 0.42s ease-in-out infinite" } : {};

  const svgTransform: React.CSSProperties = {};

  return (
    <svg width="36" height="66" viewBox="0 0 36 66" fill="none" overflow="visible" style={svgTransform}>
      <>
      {phase === "lying" && <rect x="-3" y="4" width="42" height="26" rx="11" fill="#F0EBD8" stroke="#D4CEB8" strokeWidth="0.8"/>}
      <FrontHead phase={phase} blinking={blinking} hStroke={hStroke}/>

      {/* Neck */}
      <rect x="14" y="30" width="8" height="4" rx="1.5" fill={JT}/>
      {/* Collar armour plate */}
      <rect x="10" y="30" width="16" height="2.5" rx="1.2" fill={LG} stroke={LB} strokeWidth="0.8"/>

      {/* ── Left shoulder socket ── */}
      <circle cx="7" cy="36" r="5" fill={LG} stroke={LB} strokeWidth="1.2"/>
      <circle cx="7" cy="36" r="3.2" fill="none" stroke={JT} strokeWidth="0.8" opacity="0.7"/>
      <circle cx="7" cy="36" r="1.6" fill={JT} opacity="0.8"/>
      <circle cx="6.3" cy="35.2" r="0.7" fill="rgba(255,255,255,0.18)"/>
      <circle cx="7" cy="37" r="0.65" fill={VS} opacity="0.9"/>

      {/* ── Right shoulder socket ── */}
      <circle cx="29" cy="36" r="5" fill={LG} stroke={LB} strokeWidth="1.2"/>
      <circle cx="29" cy="36" r="3.2" fill="none" stroke={JT} strokeWidth="0.8" opacity="0.7"/>
      <circle cx="29" cy="36" r="1.6" fill={JT} opacity="0.8"/>
      <circle cx="28.3" cy="35.2" r="0.7" fill="rgba(255,255,255,0.18)"/>
      <circle cx="29" cy="37" r="0.65" fill={VS} opacity="0.9"/>

      {/* ── Left arm ── */}
      <g style={{ transformOrigin: "5px 38px", ...lArmStyle }}>
        <rect x="2" y="37.5" width="6" height="5.5" rx="2.5" fill={LG} stroke={LB} strokeWidth="1"/>
        <line x1="3.5" y1="39" x2="3.5" y2="43" stroke={JT} strokeWidth="0.5" opacity="0.55"/>
        <circle cx="5" cy="43.5" r="3.1" fill={LG} stroke={LB} strokeWidth="0.9"/>
        <circle cx="5" cy="43.5" r="1.7" fill={JT} opacity="0.75"/>
        <circle cx="5" cy="43.5" r="0.7" fill={VS} opacity="0.65"/>
        <rect x="2.5" y="43" width="5" height="5.5" rx="2" fill={LG} stroke={LB} strokeWidth="1"/>
        <rect x="3" y="44.5" width="3.5" height="2.5" rx="0.8" fill="#0b1522" stroke={JT} strokeWidth="0.5"/>
        <ellipse cx="5" cy="50" rx="3.1" ry="2.3" fill={BT} stroke={BB} strokeWidth="0.8"/>
      </g>

      {/* ── Right arm ── */}
      <g style={{ transformOrigin: "31px 38px", ...rArmStyle }}>
        <rect x="28" y="37.5" width="6" height="5.5" rx="2.5" fill={LG} stroke={LB} strokeWidth="1"/>
        <line x1="32.5" y1="39" x2="32.5" y2="43" stroke={JT} strokeWidth="0.5" opacity="0.55"/>
        <circle cx="31" cy="43.5" r="3.1" fill={LG} stroke={LB} strokeWidth="0.9"/>
        <circle cx="31" cy="43.5" r="1.7" fill={JT} opacity="0.75"/>
        <circle cx="31" cy="43.5" r="0.7" fill={VS} opacity="0.65"/>
        <rect x="28.5" y="43" width="5" height="5.5" rx="2" fill={LG} stroke={LB} strokeWidth="1"/>
        <rect x="29.5" y="44.5" width="3.5" height="2.5" rx="0.8" fill="#0b1522" stroke={JT} strokeWidth="0.5"/>
        <ellipse cx="31" cy="50" rx="3.1" ry="2.3" fill={BT} stroke={BB} strokeWidth="0.8"/>
      </g>

      {/* ── Torso ── */}
      <path d="M8,35 L28,35 L26,52 L10,52 Z" fill={BD} stroke={BS} strokeWidth="1.2"/>
      <path d="M9.5,36 L17.5,36 L16.5,44.5 L9.5,44 Z" fill="#0c1828" stroke={JT} strokeWidth="0.6"/>
      <path d="M18.5,36 L26.5,36 L26.5,44 L19.5,44.5 Z" fill="#0c1828" stroke={JT} strokeWidth="0.6"/>
      <line x1="18" y1="35" x2="17.5" y2="52" stroke={JT} strokeWidth="0.6" opacity="0.55"/>

      {/* Core reactor */}
      <rect x="13.5" y="37" width="9" height="7" rx="1.5" fill="#081220" stroke={JT} strokeWidth="0.7"/>
      <circle cx="18" cy="40.5" r="4.2" fill={VS} opacity="0.03"/>
      <circle cx="18" cy="40.5" r="3.2" fill={VS} opacity="0.06"/>
      <circle cx="18" cy="40.5" r="2.2" fill={VS} opacity="0.12"/>
      <circle cx="18" cy="40.5" r="1.4" fill={VS} opacity="0.22"/>
      <circle cx="18" cy="40.5" r="0.7" fill={VS}/>
      <circle cx="17.5" cy="40" r="0.38" fill="rgba(255,255,255,0.7)"/>

      {/* Left chest vents */}
      <rect x="10" y="38" width="3" height="0.85" rx="0.4" fill={JT} opacity="0.75"/>
      <rect x="10" y="39.5" width="3" height="0.85" rx="0.4" fill={JT} opacity="0.6"/>
      <rect x="10" y="41" width="3" height="0.85" rx="0.4" fill={JT} opacity="0.45"/>
      {/* Right chest button panel */}
      <rect x="22.5" y="37.5" width="4" height="6.5" rx="0.8" fill="#0a1520" stroke={JT} strokeWidth="0.5"/>
      <rect x="23.2" y="38.3" width="1.3" height="1" rx="0.3" fill={JT} opacity="0.7"/>
      <rect x="24.9" y="38.3" width="1.3" height="1" rx="0.3" fill={JT} opacity="0.7"/>
      <rect x="23.2" y="39.8" width="1.3" height="1" rx="0.3" fill={VS} opacity="0.5"/>
      <rect x="24.9" y="39.8" width="1.3" height="1" rx="0.3" fill={JT} opacity="0.6"/>
      <rect x="23.2" y="41.3" width="1.3" height="1" rx="0.3" fill={JT} opacity="0.6"/>
      <rect x="24.9" y="41.3" width="1.3" height="1" rx="0.3" fill={VS} opacity="0.35"/>
      <rect x="23.2" y="42.8" width="1.3" height="1" rx="0.3" fill={JT} opacity="0.5"/>
      <rect x="24.9" y="42.8" width="1.3" height="1" rx="0.3" fill={JT} opacity="0.5"/>

      {/* Lower torso + waist ribs */}
      <line x1="11" y1="46" x2="25" y2="46" stroke={JT} strokeWidth="0.8" opacity="0.65"/>
      <circle cx="12" cy="46" r="1" fill={JT} opacity="0.7"/>
      <circle cx="24" cy="46" r="1" fill={JT} opacity="0.7"/>
      <rect x="11.5" y="46.5" width="13" height="1.4" rx="0.7" fill="#0d1b2c" stroke={JT} strokeWidth="0.6"/>
      <rect x="12" y="47.9" width="12" height="0.5" rx="0" fill="#060e1a" opacity="0.9"/>
      <rect x="11.5" y="48.4" width="13" height="1.4" rx="0.7" fill="#0d1b2c" stroke={JT} strokeWidth="0.55"/>
      <rect x="12" y="49.8" width="12" height="0.5" rx="0" fill="#060e1a" opacity="0.8"/>
      <rect x="11.5" y="50.3" width="13" height="1.4" rx="0.7" fill="#0d1b2c" stroke={JT} strokeWidth="0.5"/>

      {/* ── Hip plate ── */}
      <rect x="9" y="52" width="18" height="4.5" rx="2" fill={LG} stroke={LB} strokeWidth="1.1"/>
      <rect x="14" y="53.2" width="8" height="2.2" rx="1" fill="#0b1522" stroke={JT} strokeWidth="0.5"/>
      <circle cx="18" cy="54.2" r="0.9" fill={VS} opacity="0.7"/>
      <circle cx="11" cy="54.2" r="0.8" fill={JT} opacity="0.6"/>
      <circle cx="25" cy="54.2" r="0.8" fill={JT} opacity="0.6"/>
      <line x1="12.5" y1="53.5" x2="12.5" y2="55.8" stroke={JT} strokeWidth="0.5" opacity="0.4"/>
      <line x1="23.5" y1="53.5" x2="23.5" y2="55.8" stroke={JT} strokeWidth="0.5" opacity="0.4"/>

      {/* ── Left leg ── */}
      <g style={lLegStyle}>
        <rect x="10.5" y="56.5" width="7" height="6" rx="2.5" fill={LG} stroke={LB} strokeWidth="1"/>
        <line x1="12" y1="58" x2="12" y2="62" stroke={JT} strokeWidth="0.5" opacity="0.5"/>
        <circle cx="14" cy="62.5" r="3.2" fill={LG} stroke={LB} strokeWidth="0.9"/>
        <circle cx="14" cy="62.5" r="1.8" fill={JT} opacity="0.7"/>
        <circle cx="14" cy="62.5" r="0.7" fill={VS} opacity="0.5"/>
        <rect x="10.5" y="61.5" width="7" height="5.5" rx="2" fill={LG} stroke={LB} strokeWidth="1"/>
        <rect x="11.5" y="62.5" width="5" height="3.5" rx="0.8" fill="#0b1522" stroke={JT} strokeWidth="0.4"/>
        <rect x="8" y="65.5" width="11" height="3.5" rx="2" fill={BB} stroke={LB} strokeWidth="1"/>
        <rect x="8.5" y="67" width="5" height="1" rx="0.5" fill="rgba(255,255,255,0.05)"/>
      </g>

      {/* ── Right leg ── */}
      <g style={rLegStyle}>
        <rect x="18.5" y="56.5" width="7" height="6" rx="2.5" fill={LG} stroke={LB} strokeWidth="1"/>
        <line x1="24" y1="58" x2="24" y2="62" stroke={JT} strokeWidth="0.5" opacity="0.5"/>
        <circle cx="22" cy="62.5" r="3.2" fill={LG} stroke={LB} strokeWidth="0.9"/>
        <circle cx="22" cy="62.5" r="1.8" fill={JT} opacity="0.7"/>
        <circle cx="22" cy="62.5" r="0.7" fill={VS} opacity="0.5"/>
        <rect x="18.5" y="61.5" width="7" height="5.5" rx="2" fill={LG} stroke={LB} strokeWidth="1"/>
        <rect x="19.5" y="62.5" width="5" height="3.5" rx="0.8" fill="#0b1522" stroke={JT} strokeWidth="0.4"/>
        <rect x="18" y="65.5" width="11" height="3.5" rx="2" fill={BB} stroke={LB} strokeWidth="1"/>
        <rect x="18.5" y="67" width="5" height="1" rx="0.5" fill="rgba(255,255,255,0.05)"/>
      </g>

      {/* ── Phase accessories (rendered outside viewBox via overflow="visible") ── */}

      {phase === "tired" && <>
        <text x="28" y="-1" fontFamily="monospace" fontSize="9" fill="#64748b" opacity="0.9">z</text>
        <text x="34" y="-7" fontFamily="monospace" fontSize="7" fill="#64748b" opacity="0.65">z</text>
        <text x="39" y="-13" fontFamily="monospace" fontSize="5.5" fill="#64748b" opacity="0.4">z</text>
      </>}
      {phase === "coffee" && <>
        <rect x="37" y="36" width="10" height="12" rx="2" fill="#78350f" stroke="#92400e" strokeWidth="0.8"/>
        <rect x="37" y="36" width="10" height="4" rx="2" fill="#92400e"/>
        <path d="M47 39 Q51 39 51 43 Q51 47 47 47" stroke="#92400e" strokeWidth="1.2" fill="none"/>
        <path d="M40 34 Q42 31 40 27" stroke="#cbd5e1" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.5" style={{ animation: "steam-rise 2s ease-in-out infinite" }}/>
        <path d="M44 33 Q46 30 44 26" stroke="#cbd5e1" strokeWidth="1" fill="none" strokeLinecap="round" opacity="0.35" style={{ animation: "steam-rise 2s ease-in-out 0.9s infinite" }}/>
      </>}

      {phase === "thinking" && <>
        <circle cx="28" cy="-3" r="2" fill="rgba(168,85,247,0.18)" stroke="#a855f7" strokeWidth="0.7"/>
        <circle cx="33" cy="-10" r="3.5" fill="rgba(168,85,247,0.12)" stroke="#a855f7" strokeWidth="0.7"/>
        <circle cx="39" cy="-17" r="5" fill="rgba(168,85,247,0.08)" stroke="#a855f7" strokeWidth="0.7"/>
        <text x="39" y="-14" fontFamily="monospace" fontSize="7" fill="#a855f7" textAnchor="middle">?</text>
      </>}

      {phase === "complaining" && <>
        <text x="-10" y="20" fontFamily="monospace" fontSize="14" fill="#ef4444" opacity="0.95" fontWeight="bold">!</text>
        <text x="38" y="20" fontFamily="monospace" fontSize="14" fill="#ef4444" opacity="0.95" fontWeight="bold">!</text>
      </>}

      {phase === "dancing" && <>
        <text x="-9" y="22" fontFamily="serif" fontSize="12" fill="#10b981" opacity="0.8">♪</text>
        <text x="36" y="18" fontFamily="serif" fontSize="10" fill="#10b981" opacity="0.65">♫</text>
        <path d="M36 32 L36.5 30 L37 32 L39 32.5 L37 33 L36.5 35 L36 33 L34 32.5 Z" fill="#fbbf24" opacity="0.85"/>
        <path d="M-3 33 L-2.5 31.5 L-2 33 L-0.5 33.5 L-2 34 L-2.5 35.5 L-3 34 L-4.5 33.5 Z" fill="#fbbf24" opacity="0.7"/>
      </>}
      {phase === "lying" && (
        <>
          <rect x="-3" y="29" width="42" height="40" rx="3" fill="#1E3560" opacity="0.92"/>
          <rect x="-3" y="29" width="42" height="5" rx="2" fill="rgba(255,255,255,0.1)"/>
          <g style={{ animation: "ix-bed-appear 0.4s ease-out 0.8s both" }}>
            <text x="28" y="-2" fontFamily="monospace" fontSize="9" fill="#64748b" opacity="0.9">z</text>
            <text x="34" y="-9" fontFamily="monospace" fontSize="7" fill="#64748b" opacity="0.65">z</text>
            <text x="40" y="-15" fontFamily="monospace" fontSize="5.5" fill="#64748b" opacity="0.4">z</text>
          </g>
        </>
      )}
      </>
    </svg>
  );
}

// ── Phase labels ──────────────────────────────────────────────────────────────
const PHASE_LABELS: Partial<Record<Phase, string>> = {
  coffee: "coffee break", tired: "low power mode", thinking: "processing…",
  sitting: "chillin'", lying: "lying flat", complaining: "ugh!!!", dancing: "green day!!",
};
const LABEL_ACCENT: Partial<Record<Phase, string>> = {
  coffee: "#92400e", tired: "#475569", thinking: "#7c3aed",
  sitting: "#10b981", lying: "#475569", complaining: "#ef4444", dancing: "#10b981",
};
const LABEL_COLOR: Partial<Record<Phase, string>> = {
  coffee: "#fbbf24", tired: "#94a3b8", thinking: "#a855f7",
  sitting: "#10b981", lying: "#94a3b8", complaining: "#ef4444", dancing: "#10b981",
};

// ── VitalsBar ─────────────────────────────────────────────────────────────────
function VitalBar({ label, value, color }: { label: string; value: number; color: string }) {
  const isCrit = value < 25;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <span style={{ width: 26, fontSize: 8, color: "var(--ft-muted)", letterSpacing: "0.06em", fontFamily: "var(--font-mono)" }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: isCrit ? "#ef4444" : color, borderRadius: 2, transition: "width 0.6s ease" }}/>
      </div>
      <span style={{ width: 22, textAlign: "right", fontSize: 8, fontFamily: "var(--font-mono)", color: isCrit ? "#ef4444" : "var(--ft-muted)" }}>{Math.round(value)}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function AiWanderer({ onOpen, summoned, locationKey, sidebarW, portfolioSignal }: Props) {
  const [x, setX] = useState(() => window.innerWidth + 70);
  const [y] = useState(() => getDefaultY());
  const [animated, setAnimated] = useState(false);
  const [durMs, setDurMs] = useState(0);
  const [phase, setPhase] = useState<Phase>("walking");
  const [facingLeft, setFacingLeft] = useState(true);
  const [blinking, setBlinking] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const [navPhase, setNavPhase] = useState<null | "hidden" | "crawling">(null);
  const [entryType, setEntryType] = useState<EntryType>("crawl");
  const [skinId, setSkinId] = useState<BotSkinId>(getBotSkin);
  const skinIdRef = useRef<BotSkinId>(skinId);
  useEffect(() => { skinIdRef.current = skinId; }, [skinId]);
  useEffect(() => {
    function onSkinChange(e: Event) {
      const id = (e as CustomEvent).detail as BotSkinId;
      setSkinId(id);
    }
    window.addEventListener("bot-skin-change", onSkinChange);
    return () => window.removeEventListener("bot-skin-change", onSkinChange);
  }, []);
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__ft_bot = { x, skinId };
  }, [x, skinId]);

  // ── Consciousness state ────────────────────────────────────────────────────
  const ixRef = useRef<IxPersisted>((() => {
    const raw = loadIxState();
    return initSession(raw);
  })());
  const [vitals, setVitals] = useState<IxVitals>(() => ixRef.current.vitals);
  const [mood, setMood]     = useState<Mood>(() => deriveMood(ixRef.current.vitals, new Date().getHours()));
  const [xp, setXp]         = useState(() => ixRef.current.xp);
  const [level, setLevel]   = useState(() => ixRef.current.level);
  const [petActive, setPetActive]     = useState(false);
  const [isHovered, setIsHovered]     = useState(false);
  const [newAchievement, setNewAchievement] = useState<string | null>(null);
  const [levelUpAnim, setLevelUpAnim] = useState(false);
  const moodRef = useRef<Mood>(mood);

  // ── Drag / fling (ref-based physics — zero React state in RAF loop) ───────
  const [isDragActive, setIsDragActive] = useState(false);
  const outerDivRef      = useRef<HTMLDivElement>(null);
  const flingActiveRef   = useRef(false);
  const physXRef         = useRef(0);
  const physYRef         = useRef(0);
  const velXRef          = useRef(0);
  const velYRef          = useRef(0);
  const isDraggingRef    = useRef(false);
  const dragOffsetRef    = useRef({ x: 0, y: 0 });
  const pointerHistRef   = useRef<{ x: number; y: number; t: number }[]>([]);
  const pointerDownRef   = useRef({ x: 0, y: 0 });
  const petTimerRef          = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rafRef               = useRef(0);
  const spriteDivRef         = useRef<HTMLDivElement>(null);
  const peakYRef             = useRef(0);
  const idleRandomTimerRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Standard positional refs
  const xRef         = useRef(x);
  const phaseRef     = useRef<Phase>("walking");
  const arrivedRef   = useRef(false);
  const idleTimer    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blinkTimer   = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const speechTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navTimer1    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navTimer2    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navPhaseRef  = useRef<null | "hidden" | "crawling">(null);
  const sidebarWRef  = useRef(sidebarW ?? 212);
  const locationInitRef = useRef(false);

  // ── Persistence helpers ───────────────────────────────────────────────────
  function persistIx(patch?: Partial<IxPersisted>) {
    const s = { ...ixRef.current, ...patch, lastSeen: Date.now() };
    s.vitals = vitals; // sync latest vitals
    ixRef.current = s;
    saveIxState(s);
  }

  function gainXP(amount: number) {
    const s = ixRef.current;
    const newXp   = s.xp + amount;
    const newLvl  = computeLevel(newXp);
    const leveled = newLvl > s.level;

    ixRef.current = { ...s, xp: newXp, level: newLvl };
    setXp(newXp);
    setLevel(newLvl);

    if (leveled) {
      setLevelUpAnim(true);
      setTimeout(() => setLevelUpAnim(false), 3000);
      showSpeech(`LEVEL ${newLvl}! Bond: ${getBondRank(newLvl)}`);
      const newAcc = getUnlockedAccessories(newLvl);
      if (newAcc.length > 0 && !s.activeAccessory) {
        ixRef.current = { ...ixRef.current, activeAccessory: newAcc[newAcc.length - 1] };
      }
    }

    // Check achievements
    const newOnes = checkNewAchievements(ixRef.current);
    if (newOnes.length > 0) {
      ixRef.current = { ...ixRef.current, achievements: [...ixRef.current.achievements, ...newOnes] };
      setNewAchievement(ACHIEVEMENTS[newOnes[0]].label);
      setTimeout(() => setNewAchievement(null), 4000);
    }

    persistIx();
  }

  function updateVitals(v: IxVitals) {
    setVitals(v);
    ixRef.current = { ...ixRef.current, vitals: v };
    const newMood = deriveMood(v, new Date().getHours());
    moodRef.current = newMood;
    setMood(newMood);
  }

  // ── Movement / idle ───────────────────────────────────────────────────────
  function moveTo(tx: number) {
    const dx = tx - xRef.current;
    if (Math.abs(dx) < 8) return;
    const ms = Math.min(Math.max((Math.abs(dx) / 90) * 1000, 500), 5000);
    setFacingLeft(dx < 0);
    setDurMs(ms);
    phaseRef.current = "walking"; setPhase("walking");
    setAnimated(true); arrivedRef.current = false;
    xRef.current = tx; setX(tx);
  }

  function showSpeech(msg: string) {
    setSpeech(msg);
    clearTimeout(speechTimer.current);
    speechTimer.current = setTimeout(() => setSpeech(null), 5500);
  }

  function startIdle() {
    // Mood-weighted phase selection
    const pool = MOOD_PHASE_POOL[moodRef.current];
    const pick = pool[Math.floor(Math.random() * pool.length)] as Phase;

    phaseRef.current = pick; setPhase(pick);
    if (Math.random() < 0.35) {
      setTimeout(() => showSpeech(skinPickSpeech(pick as SpeechKey, skinIdRef.current)), 600);
    }
    arrivedRef.current = true; setAnimated(false);
    clearInterval(blinkTimer.current);
    blinkTimer.current = setInterval(() => {
      setBlinking(true); setTimeout(() => setBlinking(false), 130);
    }, rand(2500, 6000));

    const dur =
      pick === "lying"     ? rand(8000, 18000) :
      pick === "sitting"   ? rand(5000, 14000) :
      pick === "coffee"    ? rand(5000, 14000) :
      pick === "tired"     ? rand(5000, 12000) :
      pick === "thinking"  ? rand(4000, 9000)  :
      pick === "complaining" ? rand(3000, 7000) :
      pick === "dancing"   ? rand(3000, 8000)  : rand(3000, 8000);

    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      clearInterval(blinkTimer.current);
      if (navPhaseRef.current) return;
      if (Math.random() < 0.12) {
        phaseRef.current = "jumping"; setPhase("jumping");
        setTimeout(() => startIdle(), 800); return;
      }
      moveTo(randomTarget(sidebarWRef.current));
    }, dur);
  }

  const handleArrival = useCallback((e: React.TransitionEvent) => {
    // transitionend bubbles — only act on the X-layer's own transform transition,
    // not on filter/opacity transitions from child elements (spriteDivRef hover glow, etc.)
    if (e.propertyName !== "transform") return;
    if (arrivedRef.current || navPhaseRef.current || isDraggingRef.current) return;
    ixRef.current = { ...ixRef.current, totalInteractions: ixRef.current.totalInteractions + 1 };
    startIdle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pet / Feed ────────────────────────────────────────────────────────────
  function triggerPet() {
    if (navPhaseRef.current) return;
    setPetActive(true);
    setTimeout(() => setPetActive(false), 900);
    showSpeech(skinPickSpeech("pet", skinIdRef.current));
    const newV = petBoost(vitals);
    updateVitals(newV);
    ixRef.current = { ...ixRef.current, petCount: (ixRef.current.petCount ?? 0) + 1 };
    gainXP(XP.pet);
  }

  function scheduleIdleRandom() {
    clearTimeout(idleRandomTimerRef.current);
    idleRandomTimerRef.current = setTimeout(() => {
      if (!isDraggingRef.current && !flingActiveRef.current && !navPhaseRef.current) {
        showSpeech(skinPickSpeech("idle_random", skinIdRef.current));
      }
      scheduleIdleRandom();
    }, rand(75_000, 120_000));
  }

  // ── Drag / fling (direct DOM — no React state in RAF loop) ──────────────
  function startFling() {
    flingActiveRef.current = true;
    cancelAnimationFrame(rafRef.current);
    window.dispatchEvent(new CustomEvent("ft-bot-fling", { detail: { x: xRef.current } }));

    const FLING_H  = SPRITE_FLOOR_H["jumping"];
    const FLING_W  = SPRITE_W["jumping"];
    const floorTop = y - FLING_H;

    // Track the highest point reached so we only say "oof" on real throws
    peakYRef.current = physYRef.current;

    const tick = () => {
      if (!flingActiveRef.current) return;

      velYRef.current += 0.65;
      velXRef.current *= 0.985;
      physXRef.current += velXRef.current;
      physYRef.current += velYRef.current;

      if (physYRef.current < peakYRef.current) peakYRef.current = physYRef.current;

      const wallL = sidebarWRef.current;
      const wallR = window.innerWidth - FLING_W - 8;

      if (physYRef.current >= floorTop) {
        physYRef.current = floorTop;
        velYRef.current = -Math.abs(velYRef.current) * 0.52;
        velXRef.current *= 0.70;
        if (Math.abs(velYRef.current) < 1.5) {
          flingActiveRef.current = false;
          const landX = physXRef.current;
          if (outerDivRef.current) {
            outerDivRef.current.style.transform = `translate(${landX}px, ${floorTop}px)`;
          }
          xRef.current = landX;
          setX(landX);
          phaseRef.current = "idle"; setPhase("idle");
          setIsDragActive(false);
          if (floorTop - peakYRef.current > 60) showSpeech(skinPickSpeech("land", skinIdRef.current));
          window.dispatchEvent(new CustomEvent("ft-bot-land", { detail: { x: landX } }));
          idleTimer.current = setTimeout(() => {
            if (!isDraggingRef.current) startIdle();
          }, 500);
          return;
        }
      }
      if (physXRef.current <= wallL) { physXRef.current = wallL; velXRef.current =  Math.abs(velXRef.current) * 0.55; }
      if (physXRef.current >= wallR) { physXRef.current = wallR; velXRef.current = -Math.abs(velXRef.current) * 0.55; }
      if (physYRef.current < -200)   { physYRef.current = -200;  velYRef.current =  Math.abs(velYRef.current) * 0.4;  }

      if (outerDivRef.current) {
        outerDivRef.current.style.transform = `translate(${physXRef.current}px, ${physYRef.current}px)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (navPhaseRef.current) return;
    e.preventDefault();

    // Grab IX mid-fling: pause the fling so we can take over
    const wasFling = flingActiveRef.current;
    if (wasFling) {
      flingActiveRef.current = false;
      cancelAnimationFrame(rafRef.current);
      // physXRef / physYRef already hold the mid-air position — keep them
    }

    isDraggingRef.current = false;
    pointerDownRef.current = { x: e.clientX, y: e.clientY };
    pointerHistRef.current = [{ x: e.clientX, y: e.clientY, t: Date.now() }];

    petTimerRef.current = setTimeout(() => {
      if (!isDraggingRef.current) triggerPet();
    }, 1500);

    // Window-level listeners: hover can NEVER reach these
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - pointerDownRef.current.x;
      const dy = ev.clientY - pointerDownRef.current.y;

      if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) > 8) {
        clearTimeout(petTimerRef.current);
        isDraggingRef.current = true;

        if (!wasFling) {
          // Use actual rendered position to avoid snap-to-target on walking grab
          const rect = spriteDivRef.current?.getBoundingClientRect();
          physXRef.current = rect ? rect.left : xRef.current;
          physYRef.current = y - SPRITE_FLOOR_H["jumping"];
        }
        // If wasFling, physX/physY are already the mid-air grab point
        dragOffsetRef.current = { x: ev.clientX - physXRef.current, y: ev.clientY - physYRef.current };

        setIsDragActive(true);
        setAnimated(false);
        clearTimeout(idleTimer.current); clearInterval(blinkTimer.current);
        phaseRef.current = "jumping"; setPhase("jumping");
        showSpeech(skinPickSpeech("drag", skinIdRef.current));
      }

      if (isDraggingRef.current) {
        const rawX = ev.clientX - dragOffsetRef.current.x;
        const rawY = ev.clientY - dragOffsetRef.current.y;
        // Clamp: can't drag past sidebar, right edge, or floor
        const nx = Math.max(sidebarWRef.current, Math.min(window.innerWidth - SPRITE_W["jumping"] - 8, rawX));
        const ny = Math.min(y - SPRITE_FLOOR_H["jumping"], rawY);
        physXRef.current = nx;
        physYRef.current = ny;
        if (outerDivRef.current) {
          outerDivRef.current.style.transform = `translate(${nx}px, ${ny}px)`;
        }
        const hist = pointerHistRef.current;
        hist.push({ x: ev.clientX, y: ev.clientY, t: Date.now() });
        if (hist.length > 8) hist.shift();
      }
    }

    function onUp(ev: PointerEvent) {
      cleanup();
      clearTimeout(petTimerRef.current);

      if (isDraggingRef.current) {
        // Released after drag — compute velocity and fling
        isDraggingRef.current = false;
        const hist = pointerHistRef.current;
        let vx = 0, vy = 0;
        if (hist.length >= 2) {
          const last = hist[hist.length - 1];
          const prev = hist[Math.max(0, hist.length - 3)];
          const dt   = (last.t - prev.t) / 1000;
          if (dt > 0 && dt < 0.25) {
            vx = ((last.x - prev.x) / dt) * 0.016;
            vy = ((last.y - prev.y) / dt) * 0.016;
          }
        }
        velXRef.current = Math.max(-25, Math.min(25, vx));
        velYRef.current = Math.max(-20, Math.min(15, vy));
        startFling();
      } else if (wasFling) {
        // Tapped IX mid-air without dragging — resume fling from where it stopped
        startFling();
      } else {
        // Plain click — open chat
        ev.preventDefault();
        if (!navPhaseRef.current) {
          setSpeech(null);
          onOpen();
          ixRef.current = { ...ixRef.current, chatCount: ixRef.current.chatCount + 1 };
          updateVitals(chatBoost(vitals));
          gainXP(XP.chat);
        }
      }
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", cleanup);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", cleanup);
  }

  // ── Mount: initial entry ───────────────────────────────────────────────────
  useEffect(() => {
    xRef.current = window.innerWidth + 70; setX(xRef.current);

    // Greet based on streak / last visit
    const s  = ixRef.current;
    const isReturn = s.visitCount > 1;
    const daysSince = Math.round((Date.now() - s.lastSeen) / 86400000);
    if (isReturn && daysSince >= 1) setTimeout(() => showSpeech(`Day ${s.consecutiveDays} streak!`), 3500);

    gainXP(XP.dailyVisit + (s.consecutiveDays > 1 ? XP.streakBonus : 0));
    persistIx();

    const t = setTimeout(() => moveTo(randomTarget(sidebarWRef.current)), 200);
    scheduleIdleRandom();
    return () => {
      flingActiveRef.current = false;
      cancelAnimationFrame(rafRef.current);
      clearTimeout(t);
      clearTimeout(idleTimer.current); clearInterval(blinkTimer.current);
      clearTimeout(speechTimer.current); clearTimeout(navTimer1.current); clearTimeout(navTimer2.current);
      clearTimeout(idleRandomTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Vitals depletion tick (every 30s) ─────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const newV = applyDepletion(vitals, 30_000);
      updateVitals(newV);
      persistIx({ vitals: newV });
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vitals]);

  // ── Portfolio signal → mood event ─────────────────────────────────────────
  useEffect(() => {
    if (!portfolioSignal) return;
    if (navPhaseRef.current) return;
    if (portfolioSignal === "up") {
      clearTimeout(idleTimer.current); clearInterval(blinkTimer.current);
      phaseRef.current = "dancing"; setPhase("dancing");
      showSpeech(skinPickSpeech("dancing", skinIdRef.current));
      setTimeout(() => startIdle(), 4000);
    } else if (portfolioSignal === "down") {
      clearTimeout(idleTimer.current); clearInterval(blinkTimer.current);
      phaseRef.current = "complaining"; setPhase("complaining");
      showSpeech(skinPickSpeech("complaining", skinIdRef.current));
      setTimeout(() => startIdle(), 4000);
    }
    ixRef.current = { ...ixRef.current, lastSeen: Date.now() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioSignal]);

  // ── Summon (G key) ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!summoned) return;
    clearTimeout(idleTimer.current); clearInterval(blinkTimer.current);
    const cx = window.innerWidth / 2 - 18;
    xRef.current = cx; setX(cx);
    setFacingLeft(false);
    phaseRef.current = "idle"; setPhase("idle");
    setAnimated(true); setDurMs(600);
    setShowHint(true); setTimeout(() => setShowHint(false), 3200);
    setTimeout(() => startIdle(), 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summoned]);

  useEffect(() => { sidebarWRef.current = sidebarW ?? 212; }, [sidebarW]);

  useEffect(() => {
    const handler = () => setSkinId(getBotSkin());
    window.addEventListener("numeris-skin-change", handler);
    return () => window.removeEventListener("numeris-skin-change", handler);
  }, []);

  // ── Navigation: instant hide → entry animation ─────────────────────────────
  useEffect(() => {
    if (!locationInitRef.current) { locationInitRef.current = true; return; }
    const prevX = xRef.current;
    clearTimeout(navTimer1.current); clearTimeout(navTimer2.current);
    clearTimeout(idleTimer.current); clearInterval(blinkTimer.current); clearTimeout(speechTimer.current);
    setSpeech(null); setAnimated(false); arrivedRef.current = true;
    navPhaseRef.current = "hidden"; setNavPhase("hidden");
    const sw = sidebarWRef.current;
    const dist = Math.max(prevX - sw, 0);
    const travelDelay = Math.min(200 + dist * 0.6, 1200);
    navTimer1.current = setTimeout(() => {
      if (navPhaseRef.current !== "hidden") return;
      const currentSkin = skinIdRef.current;
      const type: EntryType = currentSkin === "mario" ? "pipe"
        : currentSkin === "gilded" ? "shimmer"
        : currentSkin === "bloodline" ? "shadow"
        : ENTRY_POOL[Math.floor(Math.random() * ENTRY_POOL.length)];
      setEntryType(type);
      if (type === "fly" || type === "shimmer") {
        const { xMin, xMax } = safeXRange(sw);
        const targetX = rand(xMin + (xMax - xMin) * 0.15, xMax - (xMax - xMin) * 0.15);
        xRef.current = targetX; setX(targetX);
        setFacingLeft(false);
        phaseRef.current = "jumping"; setPhase("jumping");
      } else if (type === "peek") {
        const peekX = sw + 20;
        xRef.current = peekX; setX(peekX);
        setFacingLeft(false);
        phaseRef.current = "walking"; setPhase("walking");
      } else if (type === "pipe") {
        // Use the right warp pipe (cw - 78), ensure it's within safe range
        const pipeX = Math.max(window.innerWidth - 78, sw + 80);
        xRef.current = pipeX; setX(pipeX);
        setFacingLeft(true); // faces left, walking into the screen after emerging
        phaseRef.current = "idle"; setPhase("idle");
      } else if (type === "shadow") {
        const { xMin, xMax } = safeXRange(sw);
        const targetX = rand(xMin, xMax);
        xRef.current = targetX; setX(targetX);
        setFacingLeft(false);
        phaseRef.current = "idle"; setPhase("idle");
      } else {
        const edgeX = sw + SPRITE_W.walking + 5;
        xRef.current = edgeX; setX(edgeX);
        setFacingLeft(false);
        phaseRef.current = "walking"; setPhase("walking");
      }
      navPhaseRef.current = "crawling"; setNavPhase("crawling");
      const dur = ENTRY_DUR[type];
      navTimer2.current = setTimeout(() => {
        if (navPhaseRef.current !== "crawling") return;
        navPhaseRef.current = null; setNavPhase(null);
        if (type === "fly" || type === "pipe" || type === "shimmer" || type === "shadow") startIdle();
        else moveTo(randomTarget(sidebarWRef.current));
      }, dur + 80);
    }, travelDelay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationKey]);

  // isWalkingLegs: animate legs whenever walking (including during crawl entry)
  // isWalkingBob: body step-bounce only when not in entry animation (would conflict)
  const isWalkingLegs = phase === "walking" && !isDragActive;
  const isWalkingBob  = phase === "walking" && navPhase === null && !isDragActive;
  const isJumping = phase === "jumping";

  if (navPhase === "hidden") return null;

  // ── Positioning ───────────────────────────────────────────────────────────
  const outerStyle: React.CSSProperties = isDragActive ? {
    position: "fixed",
    left: 0, top: 0,
    // RAF overwrites this via outerDivRef — this initial value just avoids a flash
    transform: `translate(${physXRef.current}px, ${physYRef.current}px)`,
    zIndex: 9999,
    pointerEvents: "none",
    userSelect: "none",
  } : {
    position: "fixed",
    left: 0, top: 0,
    transform: `translateY(${y - SPRITE_FLOOR_H[phase]}px)`,
    zIndex: 9990,
    pointerEvents: "none",
    userSelect: "none",
    ...(navPhase === "crawling" ? {
      width: "100vw",
      clipPath: `inset(-300px 0 -100px ${sidebarW ?? 212}px)`,
    } : {}),
  };

  const spriteW = SPRITE_W[phase];

  return (
    <>
      <style>{`
        @keyframes wand-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes wand-jump{0%{transform:translateY(0) scaleX(1) scaleY(1)}20%{transform:translateY(-24px) scaleX(0.88) scaleY(1.12)}45%{transform:translateY(-30px)}70%{transform:translateY(-3px) scaleX(1.06) scaleY(0.94)}85%{transform:translateY(3px)}100%{transform:translateY(0) scaleX(1) scaleY(1)}}
        @keyframes wand-step{0%,50%,100%{transform:translateY(0)}25%,75%{transform:translateY(-4px)}}
        @keyframes wand-sit-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
        @keyframes wand-dance{0%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-6px) rotate(-4deg)}50%{transform:translateY(-8px) rotate(0deg)}75%{transform:translateY(-6px) rotate(4deg)}100%{transform:translateY(0) rotate(0deg)}}
        @keyframes ix-thigh-f{0%,100%{transform:rotate(-28deg)}50%{transform:rotate(32deg)}}
        @keyframes ix-calf-f{0%,100%{transform:rotate(5deg)}50%{transform:rotate(28deg)}}
        @keyframes ix-thigh-b{0%,100%{transform:rotate(26deg)}50%{transform:rotate(-30deg)}}
        @keyframes ix-calf-b{0%,100%{transform:rotate(20deg)}50%{transform:rotate(3deg)}}
        @keyframes ix-arm-walk{0%,100%{transform:rotate(-17deg)}50%{transform:rotate(17deg)}}
        @keyframes ix-arm-walk-far{0%,100%{transform:rotate(17deg)}50%{transform:rotate(-17deg)}}
        @keyframes ix-walk-leg-l{0%,100%{transform:translateY(0px)}50%{transform:translateY(-5px)}}
        @keyframes ix-walk-leg-r{0%,100%{transform:translateY(-5px)}50%{transform:translateY(0px)}}
        @keyframes ix-arm-idle-l{0%,100%{transform:rotate(0deg)}50%{transform:rotate(-8deg)}}
        @keyframes ix-arm-idle-r{0%,100%{transform:rotate(0deg)}50%{transform:rotate(8deg)}}
        @keyframes ix-arm-jump-l{0%{transform:rotate(0deg)}30%{transform:rotate(-38deg)}100%{transform:rotate(0deg)}}
        @keyframes ix-arm-jump-r{0%{transform:rotate(0deg)}30%{transform:rotate(38deg)}100%{transform:rotate(0deg)}}
        @keyframes ix-arm-dance-l{0%,100%{transform:rotate(-18deg)}50%{transform:rotate(18deg)}}
        @keyframes ix-arm-dance-r{0%,100%{transform:rotate(18deg)}50%{transform:rotate(-18deg)}}
        @keyframes ix-arm-complain-l{0%,100%{transform:rotate(-14deg)}50%{transform:rotate(14deg)}}
        @keyframes ix-arm-complain-r{0%,100%{transform:rotate(14deg)}50%{transform:rotate(-14deg)}}
        @keyframes wand-complain{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
        @keyframes steam-rise{0%{opacity:0.6;transform:translateY(0) scaleX(1)}100%{opacity:0;transform:translateY(-10px) scaleX(1.4)}}
        @keyframes wand-breathe{0%,100%{transform:translateY(0)}40%,60%{transform:translateY(-2px)}}
        @keyframes wand-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
        @keyframes hint-fade{0%{opacity:0;transform:translateX(-50%) translateY(4px)}15%,80%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(-4px)}}
        @keyframes label-pop{0%{opacity:0;transform:translateX(-50%) scale(0.85)}15%{opacity:1;transform:translateX(-50%) scale(1)}85%{opacity:1;transform:translateX(-50%) scale(1)}100%{opacity:0;transform:translateX(-50%) scale(0.85)}}
        @keyframes speech-in{0%{opacity:0;transform:translateX(-50%) scale(0.8) translateY(8px)}100%{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}}
        @keyframes ix-entry-crawl{0%{transform:translateX(-65px);opacity:0}14%{opacity:1;transform:translateX(-42px)}100%{transform:translateX(0);opacity:1}}
        @keyframes ix-entry-kick{0%{transform:translateX(-70px) translateY(18px) rotate(-65deg);opacity:0}14%{opacity:1;transform:translateX(-16px) translateY(-22px) rotate(28deg)}32%{transform:translateX(4px) translateY(-10px) rotate(-8deg)}50%{transform:translateX(0px) translateY(0px) rotate(3deg)}67%{transform:translateX(-2px) translateY(-3px) rotate(-1deg)}82%{transform:translateX(1px) translateY(0px)}100%{transform:translateX(0) translateY(0) rotate(0deg)}}
        @keyframes ix-entry-fly{0%{transform:translateY(-170px);opacity:0}35%{opacity:1}76%{transform:translateY(0) scaleX(1.2) scaleY(0.7)}89%{transform:translateY(-12px) scaleX(0.93) scaleY(1.12)}100%{transform:translateY(0) scaleX(1) scaleY(1)}}
        @keyframes ix-entry-roll{0%{transform:translateX(-80px) rotate(-360deg);opacity:0}22%{opacity:0.7;transform:translateX(-48px) rotate(-220deg)}42%{opacity:1;transform:translateX(-10px) rotate(-90deg)}58%{transform:translateX(3px) rotate(-12deg)}72%{transform:translateX(-2px) rotate(6deg)}83%{transform:translateX(1px) rotate(-2deg)}100%{transform:translateX(0) rotate(0deg)}}
        @keyframes ix-entry-peek{0%{transform:translateX(-55px);opacity:0}8%{opacity:0;transform:translateX(-55px)}18%{opacity:1;transform:translateX(-36px)}34%{transform:translateX(-28px)}48%{transform:translateX(-33px)}62%{transform:translateX(-26px)}74%{transform:translateX(-30px)}86%{transform:translateX(-10px)}100%{transform:translateX(0)}}
        @keyframes ix-entry-pipe{0%{transform:translateY(90px);opacity:0}15%{transform:translateY(90px);opacity:0}22%{transform:translateY(87px);opacity:1}42%{transform:translateY(5px)}52%{transform:translateY(-17px)}66%{transform:translateY(-83px)}72%{transform:translateY(-83px)}88%{transform:translateY(0px)}93%{transform:translateY(-4px)}97%{transform:translateY(1px)}100%{transform:translateY(0);opacity:1}}
        @keyframes ix-entry-shimmer{0%{transform:translateY(-160px) rotate(-14deg);opacity:0;filter:brightness(4) saturate(0)}14%{opacity:1;transform:translateY(-90px) rotate(9deg);filter:brightness(3) saturate(0.2)}26%{transform:translateY(-22px) rotate(-4deg);filter:brightness(2.2) saturate(0.6)}36%{transform:translateY(0px) rotate(0deg) scaleX(1.2) scaleY(0.75);filter:brightness(3) saturate(2)}46%{transform:translateY(-22px) scaleX(0.92) scaleY(1.14);filter:brightness(2.2) saturate(2.5)}57%{transform:translateY(-4px) scaleX(1.06) scaleY(0.94);filter:brightness(1.6) saturate(1.8)}67%{transform:translateY(-12px) scaleX(0.97) scaleY(1.05);filter:brightness(1.3) saturate(1.4)}76%{transform:translateY(1px);filter:brightness(1.15) saturate(1.2)}84%{transform:translateY(-4px);filter:brightness(1.1)}90%{transform:translateY(1px)}95%{transform:translateY(-1.5px)}100%{transform:translateY(0) scaleX(1) scaleY(1);filter:brightness(1) saturate(1);opacity:1}}
        @keyframes ix-entry-shadow{0%{transform:translateY(100px) scaleX(0.4) scaleY(0.08);opacity:0;filter:brightness(0) sepia(1) hue-rotate(-10deg) saturate(8)}10%{opacity:0.6;transform:translateY(92px) scaleX(0.55) scaleY(0.14);filter:brightness(0.04) sepia(0.9) saturate(6)}22%{transform:translateY(72px) scaleX(0.75) scaleY(0.32);opacity:0.78;filter:brightness(0.08) sepia(0.8) contrast(1.8) saturate(5)}36%{transform:translateY(46px) scaleX(0.88) scaleY(0.6);filter:brightness(0.2) sepia(0.6) saturate(4)}50%{transform:translateY(22px) scaleX(0.95) scaleY(0.84);filter:brightness(0.4) saturate(3) sepia(0.4)}62%{transform:translateY(6px) scaleX(1) scaleY(1.02);filter:brightness(0.75) saturate(2.5) sepia(0.2)}70%{transform:translateY(-6px) scaleX(0.98) scaleY(1.08);filter:brightness(1.2) saturate(3) hue-rotate(-25deg)}78%{transform:translateY(4px) scaleY(0.96);filter:brightness(1.4) saturate(2.5) hue-rotate(-15deg)}85%{transform:translateY(-2px);filter:brightness(1.1) saturate(1.8)}91%{transform:translateY(1.5px);filter:brightness(1.05) saturate(1.3)}96%{transform:translateY(-0.5px)}100%{transform:translateY(0) scaleX(1) scaleY(1);opacity:1;filter:brightness(1) saturate(1)}}
        @keyframes ix-sparkle{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(0) translate(var(--tx,0px),var(--ty,-20px))}}
        @keyframes ix-levelup{0%{opacity:0;transform:translateX(-50%) scale(0.6) translateY(8px)}20%{opacity:1;transform:translateX(-50%) scale(1.1) translateY(0)}80%{opacity:1;transform:translateX(-50%) scale(1) translateY(0)}100%{opacity:0;transform:translateX(-50%) scale(0.9) translateY(-6px)}}
        @keyframes ix-achievement{0%{opacity:0;transform:translateX(-50%) translateY(10px)}15%{opacity:1;transform:translateX(-50%) translateY(0)}85%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(-6px)}}
        @keyframes ix-bed-appear{0%{opacity:0;transform:translateY(8px)}55%{opacity:1;transform:translateY(-1px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes ix-char-dive{0%{opacity:0;transform:translateY(-22px)}55%{opacity:1;transform:translateY(3px)}80%{transform:translateY(-1px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes ix-pipe-overlay{0%{transform:scaleY(0)}15%{transform:scaleY(1)}72%{transform:scaleY(1)}88%{transform:scaleY(0)}100%{transform:scaleY(0)}}
      `}</style>

      <div ref={outerDivRef} style={outerStyle}>
        {/* X-position layer */}
        <div style={{
          position: "relative", width: "fit-content",
          transform: isDragActive ? "none" : `translateX(${x}px)`,
          transition: (isDragActive || !animated) ? "none" : `transform ${durMs}ms linear`,
          willChange: "transform",
        }} onTransitionEnd={handleArrival}>

          {/* ── Speech bubble ── */}
          {speech && !navPhase && !isDragActive && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 14px)", left: "50%",
              transform: "translateX(-50%)",
              background: "var(--ft-surface)", border: "1px solid var(--ft-accent)", borderRadius: 8,
              padding: "9px 13px 28px", minWidth: 140, maxWidth: 210, textAlign: "center",
              pointerEvents: "auto", animation: "speech-in 0.22s ease forwards", zIndex: 4,
              boxShadow: "0 4px 24px rgba(0,0,0,0.45)",
            }}>
              <div style={{ fontSize: 11, color: "var(--ft-text)", lineHeight: 1.5 }}>{speech}</div>
              <div style={{ position: "absolute", bottom: 6, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 8 }}>
                <button onClick={(e) => { e.stopPropagation(); setSpeech(null); }}
                  style={{ fontSize: 9, color: "var(--ft-muted)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", padding: "1px 4px" }}>
                  dismiss
                </button>
                <button onClick={(e) => { e.stopPropagation(); setSpeech(null); onOpen(); }}
                  style={{ fontSize: 9, color: "var(--ft-accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", padding: "1px 4px", letterSpacing: "0.04em" }}>
                  chat →
                </button>
              </div>
              <div style={{ position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent", borderTop: "6px solid var(--ft-accent)" }}/>
            </div>
          )}

          {/* ── Phase label ── */}
          {PHASE_LABELS[phase] && !speech && !navPhase && !isDragActive && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
              background: "var(--ft-surface)", border: `1px solid ${LABEL_ACCENT[phase] ?? "var(--ft-border)"}`,
              color: LABEL_COLOR[phase] ?? "var(--ft-muted)",
              fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.04em",
              padding: "2px 7px", whiteSpace: "nowrap", pointerEvents: "none",
              animation: "label-pop 8s ease forwards",
            }}>{PHASE_LABELS[phase]}</div>
          )}

          {/* ── Summon hint ── */}
          {showHint && !navPhase && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: "50%",
              background: "var(--ft-surface)", border: "1px solid var(--ft-accent)", color: "var(--ft-accent)",
              fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em",
              padding: "3px 7px", whiteSpace: "nowrap", pointerEvents: "none",
              animation: "hint-fade 3.2s ease forwards",
            }}>Click to chat!</div>
          )}

          {/* ── Level-up toast ── */}
          {levelUpAnim && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 36px)", left: "50%",
              background: "#fbbf24", color: "#000",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
              padding: "3px 10px", borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none",
              animation: "ix-levelup 3s ease forwards",
            }}>LEVEL UP</div>
          )}

          {/* ── Achievement toast ── */}
          {newAchievement && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 56px)", left: "50%",
              background: "var(--ft-surface)", border: "1px solid #a855f7",
              color: "#a855f7",
              fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em",
              padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap", pointerEvents: "none",
              animation: "ix-achievement 4s ease forwards",
            }}>+ {newAchievement}</div>
          )}

          {/* ── Entry animation wrapper ── */}
          <div style={{
            animation: navPhase === "crawling"
              ? `${ENTRY_ANIM[entryType]} ${ENTRY_DUR[entryType]}ms ${entryType === "pipe" ? "linear" : "ease-out"} both`
              : undefined,
          }}>
            {/* ── Flip layer ── */}
            <div style={{ transform: facingLeft ? "scaleX(-1)" : "scaleX(1)", pointerEvents: navPhase === "crawling" ? "none" : "auto" }}>
              {/* ── Body animation + input handlers ── */}
              <div
                ref={spriteDivRef}
                style={{
                  position: "relative",
                  opacity: isHovered || isDragActive ? 1 : 0.84,
                  filter: isHovered && !isDragActive
                    ? `${MOOD_GLOW[mood]} brightness(1.25)`
                    : MOOD_GLOW[mood],
                  animation:
                    navPhase || isDragActive ? "none" :
                    isJumping ? "wand-jump 0.75s cubic-bezier(0.36,0.07,0.19,0.97)" :
                    isWalkingBob ? (skinId === "bloodline" ? "wand-float 2.2s ease-in-out infinite" : "wand-step 0.42s ease-in-out infinite") :
                    phase === "sitting" ? "wand-sit-bob 3s ease-in-out infinite" :
                    phase === "dancing" ? "wand-dance 0.52s ease-in-out infinite" :
                    phase === "complaining" ? "wand-complain 0.3s ease-in-out infinite" :
                    phase === "tired" ? "none" :
                    phase === "lying" ? "wand-breathe 3.5s ease-in-out infinite" :
                    skinId === "bloodline" ? "wand-float 2.2s ease-in-out infinite" :
                    "wand-bob 2.6s ease-in-out infinite",
                  cursor: "grab",
                  touchAction: "none",
                  transition: "filter 0.15s ease, opacity 0.25s ease",
                }}
                onPointerDown={handlePointerDown}
                onPointerEnter={() => setIsHovered(true)}
                onPointerLeave={() => setIsHovered(false)}
                title="Hold to pet · Drag to throw · Click to chat"
              >
                <BotSprite phase={phase} blinking={blinking} walking={isWalkingLegs} skinId={skinId} />
                {petActive && <Sparkles w={spriteW} />}
              </div>
            </div>
          </div>

        </div>
      </div>
      {/* ── Pipe overlay rendered outside all transforms so position:fixed is truly viewport-fixed ── */}
      {navPhase === "crawling" && entryType === "pipe" && (
        <div style={{
          position: "fixed",
          left: x - 4,
          bottom: 0,
          width: 44,
          height: 83,
          zIndex: 9991,
          pointerEvents: "none",
          background: "#5C94FC",
          transformOrigin: "bottom center",
          animation: "ix-pipe-overlay 1800ms linear both",
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 14, background: "#3ABB3A", borderTop: "3px solid #289028" }}>
            <div style={{ position: "absolute", left: 3, top: 3, width: 4, height: 9, background: "#50D050", borderRadius: 1 }}/>
            <div style={{ position: "absolute", right: 0, top: 0, width: 5, bottom: 0, background: "#289028" }}/>
          </div>
          <div style={{ position: "absolute", top: 14, left: 4, right: 4, bottom: 0, background: "#3ABB3A" }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 3, bottom: 0, background: "#289028" }}/>
            <div style={{ position: "absolute", left: 6, top: 4, width: 3, bottom: 8, background: "#50D050", borderRadius: 2 }}/>
          </div>
        </div>
      )}
    </>
  );
}
